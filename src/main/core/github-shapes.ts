// 判定の材料になる GitHub の応答の形（github-api.md 3.〜5.）。使う項目だけを書く。
// src/main/github/ が zod で検査し、ページをたどった分を nodes につなげてから渡す（core は I/O を持たない。ADR-011）。

/** GraphQL の作者（`author { login __typename }`） */
export interface GhAuthor {
  login: string
  /** 'User'・'Bot'・'Organization'・'Mannequin' など */
  __typename: string
}

export interface GhIssueCommentNode {
  __typename: 'IssueComment'
  id: string
  url: string
  createdAt: string
  body: string
  /** 消えたアカウントのときは null */
  author: GhAuthor | null
}

export interface GhReviewRequestedEventNode {
  __typename: 'ReviewRequestedEvent'
  id: string
  createdAt: string
  actor: GhAuthor | null
  /** User のときだけ login がある。Team・Bot などは __typename だけ */
  requestedReviewer: { __typename: string; login?: string } | null
}

export interface GhAssignedEventNode {
  __typename: 'AssignedEvent'
  id: string
  createdAt: string
  actor: GhAuthor | null
  assignee: { __typename: string; login?: string } | null
}

export type GhTimelineNode = GhIssueCommentNode | GhReviewRequestedEventNode | GhAssignedEventNode

/** PR の reviews の一覧の1件（CR-002） */
export interface GhReviewNode {
  id: string
  url: string
  /** APPROVED・CHANGES_REQUESTED・COMMENTED・DISMISSED・PENDING */
  state: string
  createdAt: string
  /** 下書き中（PENDING）のときは null */
  submittedAt: string | null
  body: string
  author: GhAuthor | null
  comments: { nodes: { url: string; body: string; replyTo: { id: string } | null }[] }
}

export interface GhPullRequestNode {
  id: string
  number: number
  title: string
  url: string
  /** OPEN・CLOSED・MERGED */
  state: string
  isDraft: boolean
  createdAt: string
  body: string
  author: GhAuthor | null
  viewerLatestReview: { state: string } | null
  timelineItems: { nodes: GhTimelineNode[] }
  reviews: { nodes: GhReviewNode[] }
}

export interface GhIssueNode {
  id: string
  number: number
  title: string
  url: string
  state: string
  createdAt: string
  body: string
  author: GhAuthor | null
  timelineItems: { nodes: (GhIssueCommentNode | GhAssignedEventNode)[] }
}

/** GitHub の通知の subject.latest_comment_url を読んだ応答（REST。M-9 の出典。CR-004） */
export interface GhLatestComment {
  html_url: string
  body: string | null
  user: { login: string; type: string } | null
}

/** PR の一覧の検索 A・B の1件（github-api.md 5.） */
export interface GhSearchPullRequest {
  id: string
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  updatedAt: string
  author: GhAuthor | null
  repository: { nameWithOwner: string }
  assignees: { nodes: { login: string }[] }
}

/** PR の一覧の検索 C の1件（利用者が作った open の PR の状態） */
export interface GhSearchPullRequestStatus {
  id: string
  reviewDecision: string | null
  latestOpinionatedReviews: { nodes: { state: string }[] }
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}

/** ワークフロー実行（REST の actions/runs の1件。github-api.md 4.）。CI の結果の分解の材料 */
export interface GhWorkflowRun {
  node_id: string
  /** やり直すと増える */
  run_attempt: number
  name: string | null
  display_title: string
  head_branch: string | null
  html_url: string
  /** completed など */
  status: string
  /** 完了していなければ null。値は GitHub のまま（business-data.md 2.3） */
  conclusion: string | null
  /** やり直すと新しくなる（created_at は最初の実行のまま） */
  updated_at: string
  /** 起動した人。actions/runs の actor の絞り込みは効かないため、これで絞る（⑬ で確かめた） */
  triggering_actor: { login: string; type: string } | null
}
