// GitHub の通知（github-api.md 2.）。
// GET /notifications に前回の ETag を If-None-Match で付け（CR-003）、Link で次のページもたどる。
// M-9 に当たったスレッドだけ、最新のコメント（subject.latest_comment_url）を読む（CR-004）。
import { z } from 'zod'
import type { GhLatestComment } from '../core/github-shapes'
import type { ListedThread } from '../core/select-threads'
import { isGitHubUrl } from '../core/url-guard'
import {
  apiPathOf,
  getAllPages,
  githubTimestamp,
  type GitHubClient,
  type GitHubFailure,
} from './client'

/** GitHub の通知のスレッド。分解するかを決める材料（core/select-threads）と、分解に要るもの */
export interface GitHubNotificationThread extends ListedThread {
  /** subject.latest_comment_url。空のことがある（github-api.md 2.） */
  latestCommentUrl: string | null
  /** "owner/name" */
  repository: string
}

export type GitHubNotificationsResult =
  | {
      kind: 'ok'
      threads: GitHubNotificationThread[]
      /** 次の問い合わせの If-None-Match に入れる */
      etag?: string
      /** X-Poll-Interval（秒）。これより短い間隔で問い合わせない */
      pollIntervalSeconds?: number
    }
  /** 前回から変わっていない（利用制限に数えられない） */
  | { kind: 'not_modified'; pollIntervalSeconds?: number }
  | { kind: 'failed'; failure: GitHubFailure }

// 使う項目だけを検査する（github-api.md 2. の「使う項目」。ほかの項目は捨てる）
const ThreadSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
  updated_at: z.iso.datetime(),
  subject: z.object({
    type: z.string().min(1),
    url: z.string().nullable(),
    latest_comment_url: z.string().nullable(),
  }),
  repository: z.object({ full_name: z.string().min(1) }),
})
const PageSchema = z.array(ThreadSchema)

/** 1ページの件数（github-api.md 2.） */
const PER_PAGE = '50'

function pollIntervalOf(headers: Headers): number | undefined {
  const seconds = Number(headers.get('x-poll-interval') ?? Number.NaN)
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined
}

function parsePage(body: unknown): GitHubNotificationThread[] | undefined {
  const parsed = PageSchema.safeParse(body)
  if (!parsed.success) return undefined
  return parsed.data.map((thread) => ({
    id: thread.id,
    reason: thread.reason,
    updatedAt: thread.updated_at,
    subjectType: thread.subject.type,
    subjectUrl: thread.subject.url,
    latestCommentUrl: thread.subject.latest_comment_url,
    repository: thread.repository.full_name,
  }))
}

/**
 * GitHub の通知を問い合わせる。all=true で GitHub 側で既読にしたものも取る（D-007）。
 * since は「前回の成功の時刻 − 5分」など（core/select-threads の notificationsSince）
 */
export async function fetchGitHubNotifications(
  client: GitHubClient,
  options: { since: string; etag: string | undefined },
): Promise<GitHubNotificationsResult> {
  const query = new URLSearchParams({
    all: 'true',
    since: githubTimestamp(options.since),
    per_page: PER_PAGE,
  })
  const result = await getAllPages(
    client,
    {
      endpoint: 'notifications',
      path: `/notifications?${query.toString()}`,
      headers: options.etag === undefined ? {} : { 'If-None-Match': options.etag },
    },
    parsePage,
  )
  if (result.kind === 'failed') return result
  const pollIntervalSeconds = pollIntervalOf(result.headers)
  const interval = pollIntervalSeconds === undefined ? {} : { pollIntervalSeconds }
  if (result.kind === 'not_modified') return { kind: 'not_modified', ...interval }
  const etag = result.headers.get('etag')
  return { kind: 'ok', threads: result.items, ...(etag === null ? {} : { etag }), ...interval }
}

const LatestCommentSchema = z.object({
  // 出来事の開く先になるため、github.com のページだけを受け取る（I-8）
  html_url: z.string().refine(isGitHubUrl),
  body: z.string().nullish(),
  user: z.object({ login: z.string().min(1), type: z.string() }).nullable(),
})

export type LatestCommentResult =
  | { kind: 'ok'; comment: GhLatestComment }
  /** 読めなかった（消えた・形が合わない・api.github.com の外を指す）。対象の作者で代える（CR-004） */
  | { kind: 'unavailable' }
  | { kind: 'failed'; failure: GitHubFailure }

/** M-9 の出典を読む（CR-004）。PR・issue・コメントのどれを指していても、使う項目は同じ名前 */
export async function fetchLatestComment(
  client: GitHubClient,
  url: string,
): Promise<LatestCommentResult> {
  const path = apiPathOf(url)
  if (path === undefined) return { kind: 'unavailable' }
  const result = await client.get({ endpoint: 'latest_comment', path })
  if (result.kind === 'failed') {
    return result.failure.kind === 'not_accessible' ? { kind: 'unavailable' } : result
  }
  if (result.kind === 'not_modified') return { kind: 'unavailable' }
  const parsed = LatestCommentSchema.safeParse(result.body)
  if (!parsed.success) return { kind: 'unavailable' }
  return {
    kind: 'ok',
    comment: {
      html_url: parsed.data.html_url,
      body: parsed.data.body ?? null,
      user: parsed.data.user,
    },
  }
}
