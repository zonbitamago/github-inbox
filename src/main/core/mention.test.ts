import { describe, expect, it } from 'vitest'
import { mentionsLogin, mentionsTeam, containsTeamMention } from './mention'

// domain-model.md 4.1 M-7: 大文字と小文字を区別せず、前後が英数字・-・/ でないこと
describe('M-7: @ユーザー名の照合', () => {
  it.each([
    ['@alice', true],
    ['見てください @alice', true],
    ['@Alice さん', true],
    ['(@alice)', true],
    ['@alice.', true],
    ['> @alice 了解です', true],
    ['@alicex', false],
    ['@alice-x', false],
    ['@alice/reviewers', false],
    ['bob@alice', false],
    ['-@alice', false],
    ['/@alice', false],
    ['alice', false],
    ['', false],
  ])('%j は alice へのメンションか: %s', (text, expected) => {
    expect(mentionsLogin(text, 'alice')).toBe(expected)
  })

  it('ユーザー名の中の記号を正規表現として扱わない', () => {
    expect(mentionsLogin('@a-b', 'a-b')).toBe(true)
    expect(mentionsLogin('@axb', 'a.b')).toBe(false)
  })
})

describe('M-7: @組織/チームの照合（D-020）', () => {
  const teams = ['example-org/reviewers']

  it.each([
    ['@example-org/reviewers', true],
    ['@Example-Org/Reviewers 見てください', true],
    ['@example-org/reviewers-2', false],
    ['@example-org/reviewersx', false],
    ['x@example-org/reviewers', false],
    ['@example-org', false],
    ['@example-org-2/reviewers', false],
  ])('%j は所属チームへのメンションか: %s', (text, expected) => {
    expect(mentionsTeam(text, teams)).toBe(expected)
  })

  it('所属チームが無ければ当たらない', () => {
    expect(mentionsTeam('@example-org/reviewers', [])).toBe(false)
  })

  // 所属チームを読めないとき（domain-model.md 10. #1）の代わりの判定に使う
  it.each([
    ['@example-org/reviewers', true],
    ['@any-org/any_team.x', true],
    ['@alice', false],
    ['mail@example-org/reviewers', false],
  ])('%j に @組織/チームの形があるか: %s', (text, expected) => {
    expect(containsTeamMention(text)).toBe(expected)
  })
})
