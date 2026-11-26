// PR の一覧と自分待ちの理由（domain-model.md 4.3、github-api.md 5.）。
import {
  WAITING_REASONS,
  type Actor,
  type PullRequestItem,
  type PullRequestState,
  type WaitingReason,
} from '../../shared/domain'
import { GHOST_LOGIN } from './constants'
import type { GhAuthor, GhSearchPullRequest, GhSearchPullRequestStatus } from './github-shapes'

export interface PrListInput {
  viewer: string
  /** 検索 A（is:pr involves:@me） */
  involves: GhSearchPullRequest[]
  /** 検索 B（is:pr review-requested:@me） */
  reviewRequested: GhSearchPullRequest[]
  /** 検索 C（is:pr is:open author:@me） */
  ownOpen: GhSearchPullRequestStatus[]
}

export function toPullRequestState(state: string, isDraft: boolean): PullRequestState {
  if (state === 'MERGED') return 'merged'
  if (state === 'CLOSED') return 'closed'
  return isDraft ? 'draft' : 'open'
}

function toActor(author: GhAuthor | null): Actor {
  return author === null
    ? { login: GHOST_LOGIN, isBot: false }
    : { login: author.login, isBot: author.__typename === 'Bot' }
}

/** WR-2・WR-3: レビューの判定。判定が空のときは、レビュアーごとの最新のレビューで決める */
function reviewReasons(status: GhSearchPullRequestStatus): WaitingReason[] {
  if (status.reviewDecision === 'CHANGES_REQUESTED') return ['changes_requested']
  if (status.reviewDecision === 'APPROVED') return ['approved']
  if (status.reviewDecision !== null) return []
  const states = status.latestOpinionatedReviews.nodes.map((review) => review.state)
  if (states.includes('CHANGES_REQUESTED')) return ['changes_requested']
  return states.includes('APPROVED') ? ['approved'] : []
}

/** WR-4: 最新のコミットのチェックの総合結果が FAILURE か ERROR */
function ciFailed(status: GhSearchPullRequestStatus): boolean {
  const state = status.commits.nodes.at(-1)?.commit.statusCheckRollup?.state
  return state === 'FAILURE' || state === 'ERROR'
}

export function buildPrList(input: PrListInput): PullRequestItem[] {
  const viewer = input.viewer.toLowerCase()
  const requested = new Set(input.reviewRequested.map((node) => node.id))
  const statuses = new Map(input.ownOpen.map((node) => [node.id, node]))

  const byId = new Map<string, GhSearchPullRequest>()
  for (const node of [...input.involves, ...input.reviewRequested]) {
    if (!byId.has(node.id)) byId.set(node.id, node)
  }

  const items = [...byId.values()].map((node): PullRequestItem => {
    const state = toPullRequestState(node.state, node.isDraft)
    const reasons = new Set<WaitingReason>()
    // WR-0: open（下書きを除く）の PR だけ
    if (state === 'open') {
      if (requested.has(node.id)) reasons.add('review_pending') // WR-1
      const status = statuses.get(node.id)
      if (status !== undefined) {
        for (const reason of reviewReasons(status)) reasons.add(reason) // WR-2・WR-3
        if (ciFailed(status)) reasons.add('ci_failed') // WR-4
      }
      if (node.assignees.nodes.some((assignee) => assignee.login.toLowerCase() === viewer)) {
        reasons.add('assigned') // WR-5
      }
    }
    return {
      id: node.id,
      repository: node.repository.nameWithOwner,
      number: node.number,
      title: node.title,
      url: node.url,
      state,
      author: toActor(node.author),
      updatedAt: node.updatedAt,
      // 表示の順（business-data.md 2.5）
      waitingReasons: WAITING_REASONS.filter((reason) => reasons.has(reason)),
    }
  })
  // 更新の新しい順（ipc-contract.md 3. の PrListSnapshot）
  return items.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
