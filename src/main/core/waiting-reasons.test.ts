import { describe, expect, it } from 'vitest'
import {
  VIEWER,
  searchInvolves,
  searchOwnOpen,
  searchReviewRequested,
} from '../../../test/support/github-fixtures'
import { PullRequestItemSchema } from '../../shared/domain'
import type { GhSearchPullRequest, GhSearchPullRequestStatus } from './github-shapes'
import { buildPrList, toPullRequestState } from './waiting-reasons'

const OWN_OPEN_APPROVED = 'PR_nxduzdVbTjmaCuCDlOddDi' // #101。検索 C で reviewDecision が APPROVED、利用者がアサイン

function build(
  overrides: {
    involves?: GhSearchPullRequest[]
    reviewRequested?: GhSearchPullRequest[]
    ownOpen?: GhSearchPullRequestStatus[]
  } = {},
) {
  return buildPrList({
    viewer: VIEWER,
    involves: overrides.involves ?? searchInvolves(),
    reviewRequested: overrides.reviewRequested ?? searchReviewRequested(),
    ownOpen: overrides.ownOpen ?? searchOwnOpen(),
  })
}

function itemOf(items: ReturnType<typeof build>, id: string) {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) throw new Error(`${id} が一覧に無い`)
  return item
}

/** 検索 C の1件を書き換える（書き換えた応答） */
function ownOpenWith(change: Partial<GhSearchPullRequestStatus>): GhSearchPullRequestStatus[] {
  return searchOwnOpen().map((node) =>
    node.id === OWN_OPEN_APPROVED ? { ...node, ...change } : node,
  )
}

describe('PR の状態の変換（domain-model.md 4.3）', () => {
  it.each([
    ['OPEN', false, 'open'],
    ['OPEN', true, 'draft'],
    ['MERGED', false, 'merged'],
    ['CLOSED', false, 'closed'],
    ['CLOSED', true, 'closed'],
  ])('%s・下書き %s → %s', (state, isDraft, expected) => {
    expect(toPullRequestState(state, isDraft)).toBe(expected)
  })
})

describe('PR の一覧（github-api.md 5.）', () => {
  it('検索 A と B を合わせ、同じ PR は1つにする', () => {
    const ids = new Set([...searchInvolves(), ...searchReviewRequested()].map((node) => node.id))
    const items = build()
    expect(items).toHaveLength(ids.size)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
  })

  it('B にだけある PR も一覧に入る', () => {
    const onlyB = { ...searchReviewRequested()[0]!, id: 'PR_onlyInSearchB' }
    expect(build({ reviewRequested: [onlyB] }).map((item) => item.id)).toContain('PR_onlyInSearchB')
  })

  it('更新の新しい順に並べる', () => {
    const times = build().map((item) => item.updatedAt)
    expect(times).toEqual(times.toSorted().reverse())
  })

  it('どの行も PullRequestItem の形（I-3）', () => {
    for (const item of build()) {
      expect(PullRequestItemSchema.safeParse(item).success).toBe(true)
    }
  })

  it('作者が消えたアカウントなら ghost（書き換えた応答）', () => {
    const involves = searchInvolves().map((node, index) =>
      index === 0 ? { ...node, author: null } : node,
    )
    const first = involves[0]!
    expect(itemOf(build({ involves }), first.id).author).toEqual({ login: 'ghost', isBot: false })
  })

  it('bot が作った PR は isBot', () => {
    const involves = searchInvolves().map((node, index) =>
      index === 0 ? { ...node, author: { login: 'example-bot', __typename: 'Bot' } } : node,
    )
    expect(itemOf(build({ involves }), involves[0]!.id).author).toEqual({
      login: 'example-bot',
      isBot: true,
    })
  })
})

describe('自分待ちの理由（domain-model.md 4.3）', () => {
  it('WR-0: open でない PR には付けない（利用者がアサインされた merged の PR）', () => {
    const merged = searchInvolves().find(
      (node) =>
        node.state === 'MERGED' &&
        node.assignees.nodes.some((assignee) => assignee.login === VIEWER),
    )!
    expect(itemOf(build(), merged.id).waitingReasons).toEqual([])
  })

  it('WR-0: 下書きの PR には付けない（書き換えた応答）', () => {
    const involves = searchInvolves().map((node) =>
      node.id === OWN_OPEN_APPROVED ? { ...node, isDraft: true } : node,
    )
    expect(itemOf(build({ involves }), OWN_OPEN_APPROVED).waitingReasons).toEqual([])
  })

  it('WR-1: 検索 B にある PR は review_pending', () => {
    const requested = searchReviewRequested()[0]!
    expect(itemOf(build(), requested.id).waitingReasons).toContain('review_pending')
  })

  it('WR-3・WR-5: reviewDecision が APPROVED で利用者がアサイン → 表示の順に approved・assigned', () => {
    expect(itemOf(build(), OWN_OPEN_APPROVED).waitingReasons).toEqual(['approved', 'assigned'])
  })

  it.each([
    [
      'WR-2: reviewDecision が CHANGES_REQUESTED',
      { reviewDecision: 'CHANGES_REQUESTED' },
      ['changes_requested'],
    ],
    ['WR-3: reviewDecision が APPROVED', { reviewDecision: 'APPROVED' }, ['approved']],
    ['reviewDecision が REVIEW_REQUIRED', { reviewDecision: 'REVIEW_REQUIRED' }, []],
    [
      'WR-2: 判定が空で、最新のレビューに CHANGES_REQUESTED がある',
      {
        reviewDecision: null,
        latestOpinionatedReviews: {
          nodes: [{ state: 'APPROVED' }, { state: 'CHANGES_REQUESTED' }],
        },
      },
      ['changes_requested'],
    ],
    [
      'WR-3: 判定が空で、最新のレビューが APPROVED だけ',
      { reviewDecision: null, latestOpinionatedReviews: { nodes: [{ state: 'APPROVED' }] } },
      ['approved'],
    ],
    [
      '判定が空で、レビューが無い',
      { reviewDecision: null, latestOpinionatedReviews: { nodes: [] } },
      [],
    ],
  ])('%s（書き換えた応答）', (_name, change, expected) => {
    const ownOpen = ownOpenWith(change)
    const involves = searchInvolves().map((node) =>
      node.id === OWN_OPEN_APPROVED ? { ...node, assignees: { nodes: [] } } : node,
    )
    expect(itemOf(build({ involves, ownOpen }), OWN_OPEN_APPROVED).waitingReasons).toEqual(expected)
  })

  it.each([
    ['FAILURE', true],
    ['ERROR', true],
    ['SUCCESS', false],
    ['PENDING', false],
  ])('WR-4: 最新のコミットのチェックが %s → ci_failed %s（書き換えた応答）', (state, expected) => {
    const ownOpen = ownOpenWith({
      commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
    })
    expect(itemOf(build({ ownOpen }), OWN_OPEN_APPROVED).waitingReasons.includes('ci_failed')).toBe(
      expected,
    )
  })

  it.each([
    ['チェックが無い', { nodes: [{ commit: { statusCheckRollup: null } }] }],
    ['コミットが無い', { nodes: [] }],
  ])('WR-4: %s → ci_failed にしない（書き換えた応答）', (_name, commits) => {
    const ownOpen = ownOpenWith({ commits })
    expect(itemOf(build({ ownOpen }), OWN_OPEN_APPROVED).waitingReasons).not.toContain('ci_failed')
  })

  it('検索 C に無い PR には、レビューと CI の理由を付けない', () => {
    expect(itemOf(build({ ownOpen: [] }), OWN_OPEN_APPROVED).waitingReasons).toEqual(['assigned'])
  })
})
