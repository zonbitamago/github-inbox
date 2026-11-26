import { describe, expect, it } from 'vitest'
import { isParticipating } from './participation'

// domain-model.md 4.2: PT-1〜3 のどれかに当たれば参加中。一度 true になったら戻さない
describe('参加中の PR の判定', () => {
  const none = {
    wasParticipating: false,
    threadReason: 'review_requested',
    viewerLatestReview: null,
    viewerAuthoredSource: false,
  }

  it.each([
    ['どれにも当たらない', none, false],
    [
      'PT-1: 利用者がレビューしたことがある',
      { ...none, viewerLatestReview: { state: 'COMMENTED' } },
      true,
    ],
    [
      'PT-2: 分解した出典に利用者のコメント・レビューがある',
      { ...none, viewerAuthoredSource: true },
      true,
    ],
    ['PT-3: スレッドの理由が comment', { ...none, threadReason: 'comment' }, true],
    ['前の取り込みで参加中だった（戻さない）', { ...none, wasParticipating: true }, true],
  ])('%s', (_name, input, expected) => {
    expect(isParticipating(input)).toBe(expected)
  })
})
