import { describe, expect, it } from 'vitest'
import type { PullRequestItem } from '../../../shared/domain'
import {
  ANY_REASON,
  NO_FILTER,
  filterPrs,
  isFiltering,
  repositoriesOf,
  repositoryLabel,
  type PrFilter,
} from './filter-prs'

const item = (change: Partial<PullRequestItem> & { id: string }): PullRequestItem => ({
  repository: 'example-org/app',
  number: 1,
  title: 'ログイン画面の文言を直す',
  url: `https://github.com/example-org/app/pull/1`,
  state: 'open',
  author: { login: 'bob', isBot: false },
  updatedAt: '2026-01-30T00:00:00Z',
  waitingReasons: [],
  ...change,
})

const ITEMS = [
  item({ id: 'p1', number: 101, waitingReasons: ['review_pending'] }),
  item({
    id: 'p2',
    repository: 'example-org/api',
    number: 7,
    title: 'Fix Typo',
    author: { login: 'alice', isBot: false },
    waitingReasons: ['changes_requested', 'ci_failed'],
  }),
  item({
    id: 'p3',
    state: 'merged',
    title: '依存の更新',
    author: { login: 'example-bot', isBot: true },
  }),
  item({ id: 'p4', state: 'draft', repository: 'example-org/api', number: 9 }),
  item({ id: 'p5', state: 'closed', waitingReasons: [] }),
  item({ id: 'p6', waitingReasons: ['assigned'] }),
]

const ids = (filter: Partial<PrFilter>) =>
  filterPrs(ITEMS, { ...NO_FILTER, ...filter }).map((pr) => pr.id)

// F-18、AC-22
describe('PR の一覧の絞り込み（F-18、AC-22）', () => {
  it.each<[string, Partial<PrFilter>, string[]]>([
    ['絞らなければ全部（並びは変えない）', {}, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']],
    ['文字: タイトル', { text: '文言' }, ['p1', 'p4', 'p5', 'p6']],
    ['文字: 大文字と小文字は区別しない', { text: 'typo' }, ['p2']],
    ['文字: リポジトリと番号（表示と同じ形）', { text: 'api #7' }, ['p2']],
    ['文字: 作成者', { text: 'example-bot' }, ['p3']],
    ['文字: 空白で区切った語をすべて含む', { text: 'ログイン #101' }, ['p1']],
    ['文字: 空白だけなら絞らない', { text: '  ' }, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']],
    ['状態: 下書き', { state: 'draft' }, ['p4']],
    ['状態: マージ済み', { state: 'merged' }, ['p3']],
    ['リポジトリ', { repository: 'example-org/api' }, ['p2', 'p4']],
    ['理由: レビュー依頼に未対応', { reason: 'review_pending' }, ['p1']],
    ['理由: CI 失敗（ほかの理由と一緒でもよい）', { reason: 'ci_failed' }, ['p2']],
    ['理由: 自分待ちの理由あり（どれか1つ）', { reason: ANY_REASON }, ['p1', 'p2', 'p6']],
    [
      '条件を重ねる',
      { reason: ANY_REASON, repository: 'example-org/app', text: 'ログイン' },
      ['p1', 'p6'],
    ],
  ])('%s', (_name, filter, expected) => {
    expect(ids(filter)).toEqual(expected)
  })
})

describe('絞り込みの細部', () => {
  it.each<[string, PrFilter, boolean]>([
    ['何も選んでいない', NO_FILTER, false],
    ['空白だけ', { ...NO_FILTER, text: ' ' }, false],
    ['文字', { ...NO_FILTER, text: 'a' }, true],
    ['状態', { ...NO_FILTER, state: 'open' }, true],
    ['リポジトリ', { ...NO_FILTER, repository: 'example-org/app' }, true],
    ['理由', { ...NO_FILTER, reason: ANY_REASON }, true],
  ])('絞り込み中か: %s', (_name, filter, expected) => {
    expect(isFiltering(filter)).toBe(expected)
  })

  it('リポジトリの選択肢は、重ねず名前の順', () => {
    expect(repositoriesOf(ITEMS)).toEqual(['example-org/api', 'example-org/app'])
  })

  it('行に出すリポジトリと番号は owner/name #番号', () => {
    expect(repositoryLabel(ITEMS[1] ?? item({ id: 'x' }))).toBe('example-org/api #7')
  })
})
