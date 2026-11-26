// CI の結果の分解（domain-model.md 4.1 の最後の注、github-api.md 4.。F-05）。
// ci_activity のスレッドは、どの実行かを持たない（subject.url が空。⑬ で確かめた）ため、
// リポジトリのワークフロー実行から、利用者が起動して完了したものを結果を問わず ci にする。
import type { GitHubEvent } from '../../shared/domain'
import type { GhWorkflowRun } from './github-shapes'

export interface ExpandRunsInput {
  /** 利用者のユーザー名 */
  viewer: string
  /** "owner/name"（GitHub の通知のスレッドのリポジトリ） */
  repository: string
  runs: GhWorkflowRun[]
  /** この時刻以降に終わった（updated_at）実行だけ。やり直しは updated_at だけが新しくなる */
  since: string
  /** 受け取った時刻（core は時計に触れない） */
  receivedAt: string
}

/** 「ワークフロー名: 表示のタイトル（ブランチ）」（github-api.md 4. の name・display_title・head_branch。⑬ で AI が決めた形） */
function titleOf(run: GhWorkflowRun): string {
  const head = run.name === null ? run.display_title : `${run.name}: ${run.display_title}`
  return run.head_branch === null ? head : `${head}（${run.head_branch}）`
}

export function expandWorkflowRuns(input: ExpandRunsInput): GitHubEvent[] {
  const viewer = input.viewer.toLowerCase()
  const events: GitHubEvent[] = []
  for (const run of input.runs) {
    const actor = run.triggering_actor
    // 利用者が起動したもの（actions/runs の actor の絞り込みは効かない。⑬ で確かめた）
    if (actor === null || actor.login.toLowerCase() !== viewer) continue
    // 完了したもの
    if (run.status !== 'completed' || run.conclusion === null) continue
    if (run.updated_at < input.since) continue
    events.push({
      // domain-model.md 3.: ワークフロー実行の node ID ＋ # ＋ 実行の回数
      id: `${run.node_id}#${run.run_attempt}`,
      type: 'ci',
      ciConclusion: run.conclusion,
      target: {
        kind: 'workflow_run',
        repository: input.repository,
        title: titleOf(run),
        url: run.html_url,
      },
      actor: { login: actor.login, isBot: actor.type === 'Bot' },
      occurredAt: run.updated_at,
      url: run.html_url,
      receivedAt: input.receivedAt,
    })
  }
  return events.toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}
