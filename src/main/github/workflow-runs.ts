// CI の結果（github-api.md 4.）。ci_activity のスレッドのリポジトリについて、利用者が起動したワークフロー実行を取る。
// actor の絞り込みは効かない（⑬ で確かめた）ため、どれを出来事にするかは core/expand-workflow-runs が triggering_actor で決める。
import { z } from 'zod'
import { DAY_MS } from '../core/constants'
import type { GhWorkflowRun } from '../core/github-shapes'
import { getAllPages, type GitHubClient, type GitHubFailure } from './client'

export type WorkflowRunsResult =
  { kind: 'ok'; runs: GhWorkflowRun[] } | { kind: 'failed'; failure: GitHubFailure }

// 使う項目だけを検査する（core/github-shapes の GhWorkflowRun）
const RunSchema = z.object({
  node_id: z.string().min(1),
  run_attempt: z.int().positive(),
  name: z.string().nullable(),
  display_title: z.string(),
  head_branch: z.string().nullable(),
  html_url: z.string().min(1),
  status: z.string(),
  conclusion: z.string().nullable(),
  updated_at: z.iso.datetime(),
  triggering_actor: z.object({ login: z.string().min(1), type: z.string() }).nullable(),
})
const PageSchema = z.object({ workflow_runs: z.array(RunSchema) })

/** 1ページの件数（github-api.md 4.） */
const PER_PAGE = '100'

/** 作られた日付で絞るのは since の前の日から（日付をまたいで終わった実行を落とさない。DR-09）。UTC の日付 */
export function createdFrom(since: string): string {
  return new Date(Date.parse(since) - DAY_MS).toISOString().slice(0, 10)
}

export async function fetchWorkflowRuns(
  client: GitHubClient,
  options: {
    /** "owner/name"（GitHub の通知のスレッドのリポジトリ） */
    repository: string
    /** 利用者のユーザー名 */
    actor: string
    /** スレッドの since。これより前の日に作られた実行は取らない */
    since: string
  },
): Promise<WorkflowRunsResult> {
  const [owner = '', name = ''] = options.repository.split('/')
  const query = new URLSearchParams({
    actor: options.actor,
    status: 'completed',
    created: `>=${createdFrom(options.since)}`,
    per_page: PER_PAGE,
  })
  const result = await getAllPages(
    client,
    {
      endpoint: 'workflow_runs',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?${query.toString()}`,
    },
    (body) => {
      const parsed = PageSchema.safeParse(body)
      return parsed.success ? parsed.data.workflow_runs : undefined
    },
  )
  if (result.kind === 'failed') return result
  // If-None-Match を付けないので 304 は来ないはず。来たら想定外の応答とする
  if (result.kind === 'not_modified') {
    return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
  }
  return { kind: 'ok', runs: result.items }
}
