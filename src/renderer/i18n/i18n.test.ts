import { describe, expect, it } from 'vitest'
import { EVENT_TYPES, REVIEW_RESULTS } from '../../shared/domain'
import { en } from './en'
import { ja } from './ja'
import { fillMessage, translate } from './index'

// component-frontend.md 5.「言語（F-26）」
describe('文言', () => {
  it('英語と日本語で、キーが同じで、空の文言が無い', () => {
    expect(Object.keys(en).toSorted()).toEqual(Object.keys(ja).toSorted())
    expect([...Object.values(ja), ...Object.values(en)].every((text) => text.trim() !== '')).toBe(
      true,
    )
  })

  it('出来事の種類の表示名が全部ある（business-data.md 2.1）', () => {
    for (const type of EVENT_TYPES) {
      expect(translate('ja', `eventType.${type}`)).not.toBe(`eventType.${type}`)
    }
  })

  it('レビューの結果の表示名が全部ある（business-data.md 2.2）', () => {
    expect(REVIEW_RESULTS.map((result) => translate('ja', `reviewResult.${result}`))).toEqual([
      '承認',
      '修正依頼',
      'コメントのみ',
    ])
  })

  it.each([
    ['ja', 'eventType.review_requested', 'レビュー依頼'],
    ['en', 'eventType.review_requested', 'Review requested'],
  ] as const)('%s: %s → %s', (language, key, expected) => {
    expect(translate(language, key)).toBe(expected)
  })
})

describe('文言への差し込み', () => {
  it.each([
    [
      '件数を入れる',
      '{count} 件のリンクをコピーしました',
      { count: 3 },
      '3 件のリンクをコピーしました',
    ],
    ['無い名前はそのまま', '{count} と {other}', { count: 1 }, '1 と {other}'],
    ['差し込みの無い文言はそのまま', 'コピーしました', { count: 1 }, 'コピーしました'],
  ])('%s', (_name, message, values, expected) => {
    expect(fillMessage(message, values)).toBe(expected)
  })
})
