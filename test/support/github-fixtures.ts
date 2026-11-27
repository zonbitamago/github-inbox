// 記録した GitHub の応答（test/fixtures/github/）を、判定の材料の形で取り出すテストの補助。
// 応答の形は src/main/github/ が zod で検査するもので、ここでは型を当てるだけにする（テストの中だけ）。
import expandOthers from '../fixtures/github/graphql-expand-others-prs-and-issue.json'
import expandOwn from '../fixtures/github/graphql-expand-own-prs.json'
import latestIssueBody from '../fixtures/github/rest-latest-comment-issue-body.json'
import latestIssueComment from '../fixtures/github/rest-latest-comment-issue-comment.json'
import latestPrBody from '../fixtures/github/rest-latest-comment-pr-body.json'
import workflowRuns from '../fixtures/github/rest-workflow-runs.json'
import searchA from '../fixtures/github/graphql-search-a-involves.json'
import searchB from '../fixtures/github/graphql-search-b-review-requested.json'
import searchC from '../fixtures/github/graphql-search-c-own-open.json'
import notificationsAll from '../fixtures/github/notifications-all.json'
import notificationsCi from '../fixtures/github/notifications-repo-ci-activity.json'
import type { ListedThread } from '../../src/main/core/select-threads'
import type {
  GhIssueNode,
  GhLatestComment,
  GhPullRequestNode,
  GhSearchPullRequest,
  GhSearchPullRequestStatus,
  GhWorkflowRun,
} from '../../src/main/core/github-shapes'

/** 記録した応答の利用者 */
export const VIEWER = 'alice'

/** 記録した分解の応答の since（日時は 2026-01-01 起点にずらしてある） */
export const RECORDED_SINCE = '2026-01-01T00:00:00Z'

const own = expandOwn.response.body.data as unknown as Record<
  string,
  { pullRequest: GhPullRequestNode }
>
const others = expandOthers.response.body.data as unknown as Record<
  string,
  { pullRequest?: GhPullRequestNode; issue?: GhIssueNode }
>

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`記録した応答に ${name} が無い`)
  return structuredClone(value)
}

/** 利用者が作った open の PR（#101。返信だけのレビューは利用者自身のもの、bot のレビューとコメント） */
export const ownOpenPr = (): GhPullRequestNode => required(own['t0']?.pullRequest, 'own t0')
/** 利用者が作った merged の PR（#139。他人の返信だけのレビュー、@alice を含むレビュー） */
export const ownMergedPr = (): GhPullRequestNode => required(own['t1']?.pullRequest, 'own t1')
/** 他人（frank）の open の PR（#102。利用者へのレビュー依頼、bot のコメント、利用者のレビュー） */
export const othersPrRequested = (): GhPullRequestNode =>
  required(others['t0']?.pullRequest, 'others t0')
/** 他人（bob）の open の PR（#106。@alice を含むコメント、利用者へのレビュー依頼） */
export const othersPrMention = (): GhPullRequestNode =>
  required(others['t1']?.pullRequest, 'others t1')
/** bot が作った closed の issue（#120。本文に @alice、利用者へのアサイン） */
export const botIssue = (): GhIssueNode => required(others['t2']?.issue, 'others t2')
/** 他人（peggy）の open の PR（#149。利用者が承認済み、他人の返信だけのレビュー） */
export const othersPrParticipating = (): GhPullRequestNode =>
  required(others['t3']?.pullRequest, 'others t3')

export const latestCommentPrBody = (): GhLatestComment =>
  structuredClone(latestPrBody.response.body as unknown as GhLatestComment)
export const latestCommentIssueBody = (): GhLatestComment =>
  structuredClone(latestIssueBody.response.body as unknown as GhLatestComment)
export const latestCommentIssueComment = (): GhLatestComment =>
  structuredClone(latestIssueComment.response.body as unknown as GhLatestComment)

export const searchInvolves = (): GhSearchPullRequest[] =>
  structuredClone(searchA.response.body.data.search.nodes as unknown as GhSearchPullRequest[])
export const searchReviewRequested = (): GhSearchPullRequest[] =>
  structuredClone(searchB.response.body.data.search.nodes as unknown as GhSearchPullRequest[])
export const searchOwnOpen = (): GhSearchPullRequestStatus[] =>
  structuredClone(searchC.response.body.data.search.nodes as unknown as GhSearchPullRequestStatus[])

/** 本リポジトリ（架空の名前では alice/tools）のワークフロー実行。利用者の push・PR・やり直し（2回目）と、bot（Dependabot）の実行 */
export const recordedWorkflowRuns = (): GhWorkflowRun[] =>
  structuredClone(workflowRuns.response.body.workflow_runs as unknown as GhWorkflowRun[])

/** ワークフロー実行の記録の since（日時は 2026-01-01 起点にずらしてある） */
export const RECORDED_CI_SINCE = '2026-01-01T00:00:00Z'

/** GitHub の通知の1件のうち、分解するかを決める材料（github/notifications.ts が zod で取り出す項目と同じ） */
interface RecordedThread {
  id: string
  reason: string
  updated_at: string
  subject: { type: string; url: string | null }
}

const toListedThread = (thread: RecordedThread): ListedThread => ({
  id: thread.id,
  reason: thread.reason,
  updatedAt: thread.updated_at,
  subjectType: thread.subject.type,
  subjectUrl: thread.subject.url,
})

/** GET /notifications?all=true の最初のページ（50件。PR 47・issue 3） */
export const recordedGitHubNotificationThreads = (): ListedThread[] =>
  (notificationsAll.response.body as RecordedThread[]).map(toListedThread)

/** 本リポジトリ（alice/tools）の GitHub の通知。ci_activity（CheckSuite、subject.url は空）1件と state_change 3件 */
export const recordedCiGitHubNotificationThreads = (): ListedThread[] =>
  (notificationsCi.response.body as RecordedThread[]).map(toListedThread)

/** 記録した分解の応答の PR・issue を、リポジトリと番号で引く（own と others の2つの記録から） */
function recordedSubject(
  owner: unknown,
  name: unknown,
  number: unknown,
): { pullRequest: unknown } | { issue: unknown } | undefined {
  for (const recorded of [expandOwn, expandOthers]) {
    const variables: Record<string, unknown> = recorded.request.body.variables
    const data: Record<string, unknown> = recorded.response.body.data
    for (let index = 0; `o${index}` in variables; index += 1) {
      if (
        variables[`o${index}`] === owner &&
        variables[`r${index}`] === name &&
        variables[`n${index}`] === number
      ) {
        return structuredClone(data[`t${index}`]) as { pullRequest: unknown } | { issue: unknown }
      }
    }
  }
  return undefined
}

/**
 * 別名でまとめた分解の問い合わせ（github-api.md 3.）への応答を、記録した応答の PR・issue を組み直して作る（書き換えた応答）。
 * 記録に無い PR・issue は null（GitHub の「見つからない」と同じ形）にする
 */
export function recordedExpandResponse(variables: Record<string, unknown>): {
  data: Record<string, unknown>
} {
  const data: Record<string, unknown> = {
    rateLimit: expandOwn.response.body.data.rateLimit,
  }
  for (let index = 0; `o${index}` in variables; index += 1) {
    data[`t${index}`] =
      recordedSubject(variables[`o${index}`], variables[`r${index}`], variables[`n${index}`]) ??
      null
  }
  return { data }
}

/** 記録した分解の応答に対応する、GitHub の通知のスレッド（notifications-all.json の50件のうち6件） */
export const RECORDED_EXPANDED_THREAD_IDS = [
  '49230809513',
  '62719202869',
  '31545837801',
  '37955540409',
  '63163524336',
  '19123953720',
] as const

/** GET /notifications の記録した応答のうち、分解の応答を記録してあるスレッドだけ（書き換えた応答） */
export function recordedExpandedGitHubNotifications(): unknown[] {
  const wanted = new Set<string>(RECORDED_EXPANDED_THREAD_IDS)
  return structuredClone(notificationsAll.response.body).filter((thread) => wanted.has(thread.id))
}

/** 記録した GET /notifications の応答のヘッダー（Link を外した。書き換えた応答） */
export function recordedGitHubNotificationHeaders(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(notificationsAll.response.headers).filter(([name]) => name !== 'link'),
  )
}
