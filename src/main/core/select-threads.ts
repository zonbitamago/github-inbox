// 取り込みの1回分の前半（component-backend.md 5.2 の 2.〜3.。CR-010）。
// domain-model.md 4.1「分解するスレッド」（理由と種類で選ぶ）と、5.「取り込みの記録」（どの時刻から取るか）。
import { DAY_MS, INGEST_OVERLAP_MS } from './constants'

/** GitHub の通知のスレッドのうち、分解するかを決める材料（github/notifications.ts が zod で検査して渡す） */
export interface ListedThread {
  id: string
  reason: string
  /** スレッドの更新時刻（updated_at） */
  updatedAt: string
  /** subject.type（PullRequest・Issue・CheckSuite など） */
  subjectType: string
  /** subject.url（REST の API の URL）。CheckSuite では空 */
  subjectUrl: string | null
}

/** スレッドの取り込みの記録のうち、ここで使うもの */
export interface ThreadCursor {
  /** ここまで分解した */
  expandedUntil: string
  consecutiveFailures: number
}

export type ThreadRoute =
  /** GraphQL で分解する（github-api.md 3.） */
  | { kind: 'pull_request' | 'issue'; owner: string; name: string; number: number }
  /** ワークフロー実行から CI の結果を作る（github-api.md 4.） */
  | { kind: 'ci' }

export interface SelectedThread {
  id: string
  route: ThreadRoute
  /** この時刻以降の出典を分解する */
  since: string
}

/** 4.1: GraphQL で分解する理由 */
const EXPAND_REASONS = new Set([
  'review_requested',
  'author',
  'comment',
  'mention',
  'team_mention',
  'assign',
])
const EXPAND_SUBJECT_TYPES = new Set(['PullRequest', 'Issue'])
const SUBJECT_PATH = /^\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)$/
const API_ORIGIN = 'https://api.github.com'

const minus = (iso: string, ms: number) => new Date(Date.parse(iso) - ms).toISOString()

/**
 * GitHub の通知の since（5.）。「前回の成功の時刻 − 5分」と「今 − 出来事の一覧の日数」の新しい方。
 * 前回の成功が無い（初回・壊れて捨てた）ときは「今 − 出来事の一覧の日数」
 */
export function githubNotificationsSince(input: {
  lastSuccessAt: string | undefined
  now: string
  eventDays: number
}): string {
  const oldest = Date.parse(input.now) - input.eventDays * DAY_MS
  if (input.lastSuccessAt === undefined) return new Date(oldest).toISOString()
  return new Date(
    Math.max(Date.parse(input.lastSuccessAt) - INGEST_OVERLAP_MS, oldest),
  ).toISOString()
}

/** subject.url が …/pulls/{番号} なら PR、…/issues/{番号} なら issue（github-api.md 2.） */
function subjectRoute(subjectUrl: string | null): ThreadRoute | undefined {
  if (subjectUrl === null) return undefined
  let url: URL
  try {
    url = new URL(subjectUrl)
  } catch {
    return undefined
  }
  if (url.origin !== API_ORIGIN) return undefined
  const match = SUBJECT_PATH.exec(url.pathname)
  if (match === null) return undefined
  const [, owner = '', name = '', kind, number = ''] = match
  return {
    kind: kind === 'pulls' ? 'pull_request' : 'issue',
    owner: decodeURIComponent(owner),
    name: decodeURIComponent(name),
    number: Number(number),
  }
}

/** 4.1: 理由と種類で、どう分解するかを決める。分解しないなら undefined */
function routeOf(thread: ListedThread): ThreadRoute | undefined {
  if (thread.reason === 'ci_activity') {
    return thread.subjectType === 'CheckSuite' ? { kind: 'ci' } : undefined
  }
  if (!EXPAND_REASONS.has(thread.reason) || !EXPAND_SUBJECT_TYPES.has(thread.subjectType)) {
    return undefined
  }
  return subjectRoute(thread.subjectUrl)
}

/**
 * 分解するスレッドと、スレッドごとの since を決める（4.1・5.）。並びは渡した順のまま。
 * - 記録が無ければ GitHub の通知の since から、記録があれば「分解した時刻 − 5分」から
 * - 前回分解できた（続けて失敗した回数が0）スレッドで、更新時刻が分解した時刻より後でなければ飛ばす
 */
export function selectThreads(input: {
  threads: readonly ListedThread[]
  cursors: ReadonlyMap<string, ThreadCursor>
  githubNotificationsSince: string
}): SelectedThread[] {
  const selected: SelectedThread[] = []
  for (const thread of input.threads) {
    const route = routeOf(thread)
    if (route === undefined) continue
    const cursor = input.cursors.get(thread.id)
    if (cursor === undefined) {
      selected.push({ id: thread.id, route, since: input.githubNotificationsSince })
      continue
    }
    const expanded =
      cursor.consecutiveFailures === 0 &&
      Date.parse(thread.updatedAt) <= Date.parse(cursor.expandedUntil)
    if (expanded) continue
    selected.push({ id: thread.id, route, since: minus(cursor.expandedUntil, INGEST_OVERLAP_MS) })
  }
  return selected
}
