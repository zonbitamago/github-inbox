import { describe, expect, it } from 'vitest'
import { githubEvent } from '../../../../test/support/fake-github-inbox-api'
import {
  NO_FILTER,
  filterEvents,
  isFiltering,
  repositoriesOf,
  type EventFilter,
} from './filter-events'

const comment = githubEvent('IC_1', '2026-01-03T00:00:00Z', {
  excerpt: 'Typo を直しました',
})
const review = githubEvent('PRR_1', '2026-01-02T00:00:00Z', {
  type: 'review',
  reviewResult: 'approved',
  actor: { login: 'carol', isBot: false },
  target: {
    kind: 'pull_request',
    repository: 'example-org/api',
    number: 7,
    title: '検索を速くする',
    url: 'https://github.com/example-org/api/pull/7',
  },
})
const ci = githubEvent('WFR_1#1', '2026-01-01T00:00:00Z', {
  type: 'ci',
  ciConclusion: 'failure',
  actor: { login: 'alice', isBot: false },
  target: {
    kind: 'workflow_run',
    repository: 'alice/tools',
    title: 'CI: 文言を直す（main）',
    url: 'https://github.com/alice/tools/actions/runs/1',
  },
})
const events = [comment, review, ci]

const ids = (filter: Partial<EventFilter>) =>
  filterEvents(events, { ...NO_FILTER, ...filter }).map((event) => event.id)

// component-frontend.md 2.2、F-13、AC-16
describe('出来事の一覧の絞り込み（F-13）', () => {
  it('条件が無ければ、全部を並びのまま返す', () => {
    expect(ids({})).toEqual(['IC_1', 'PRR_1', 'WFR_1#1'])
  })

  it.each([
    ['対象のタイトル', '検索', ['PRR_1']],
    ['リポジトリ', 'example-org/api', ['PRR_1']],
    ['番号', '#101', ['IC_1']],
    ['誰が', 'CAROL', ['PRR_1']],
    ['抜粋', 'typo', ['IC_1']],
    ['CI の結果（GitHub の値のまま）', 'failure', ['WFR_1#1']],
    ['空白で区切った語はすべて含むもの', 'example-org 直', ['IC_1']],
    ['前後の空白は見ない', '  検索  ', ['PRR_1']],
    ['どれにも合わない', 'nothing', []],
  ])('文字で探す: %s', (_name, text, expected) => {
    expect(ids({ text })).toEqual(expected)
  })

  it('種類で絞る', () => {
    expect(ids({ type: 'ci' })).toEqual(['WFR_1#1'])
  })

  it('リポジトリで絞る', () => {
    expect(ids({ repository: 'example-org/app' })).toEqual(['IC_1'])
  })

  it('条件は重ねて使う', () => {
    expect(ids({ repository: 'example-org/api', type: 'review', text: 'carol' })).toEqual(['PRR_1'])
    expect(ids({ repository: 'example-org/api', type: 'comment' })).toEqual([])
  })

  it.each([
    ['条件が無い', NO_FILTER, false],
    ['空白だけの文字', { ...NO_FILTER, text: '  ' }, false],
    ['文字', { ...NO_FILTER, text: 'a' }, true],
    ['種類', { ...NO_FILTER, type: 'ci' }, true],
    ['リポジトリ', { ...NO_FILTER, repository: 'alice/tools' }, true],
  ] satisfies [string, EventFilter, boolean][])(
    '絞り込み中か: %s → %s',
    (_name, filter, expected) => {
      expect(isFiltering(filter)).toBe(expected)
    },
  )

  it('選択肢のリポジトリは、重ねずに名前の順', () => {
    expect(repositoriesOf([...events, comment])).toEqual([
      'alice/tools',
      'example-org/api',
      'example-org/app',
    ])
  })
})
