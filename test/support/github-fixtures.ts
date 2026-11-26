// 記録した GitHub の応答（test/fixtures/github/）を、判定の材料の形で取り出すテストの補助。
// 応答の形は src/main/github/ が zod で検査するもので、ここでは型を当てるだけにする（テストの中だけ）。
import expandOthers from '../fixtures/github/graphql-expand-others-prs-and-issue.json'
import expandOwn from '../fixtures/github/graphql-expand-own-prs.json'
import latestIssueBody from '../fixtures/github/rest-latest-comment-issue-body.json'
import latestIssueComment from '../fixtures/github/rest-latest-comment-issue-comment.json'
import latestPrBody from '../fixtures/github/rest-latest-comment-pr-body.json'
import searchA from '../fixtures/github/graphql-search-a-involves.json'
import searchB from '../fixtures/github/graphql-search-b-review-requested.json'
import searchC from '../fixtures/github/graphql-search-c-own-open.json'
import type {
  GhIssueNode,
  GhLatestComment,
  GhPullRequestNode,
  GhSearchPullRequest,
  GhSearchPullRequestStatus,
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
