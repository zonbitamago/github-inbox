import { describe, expect, it } from 'vitest'
import {
  recordedCiGitHubNotificationThreads,
  recordedGitHubNotificationThreads,
} from '../../../test/support/github-fixtures'
import {
  githubNotificationsSince,
  selectThreads,
  type ListedThread,
  type ThreadCursor,
} from './select-threads'

const NOW = '2026-01-31T00:00:00.000Z'
const SINCE = '2026-01-30T23:00:00.000Z'
const PR_URL = 'https://api.github.com/repos/example-org/app/pulls/101'
const ISSUE_URL = 'https://api.github.com/repos/example-org/docs/issues/120'

function thread(change: Partial<ListedThread> = {}): ListedThread {
  return {
    id: '100',
    reason: 'mention',
    updatedAt: '2026-01-30T23:30:00Z',
    subjectType: 'PullRequest',
    subjectUrl: PR_URL,
    ...change,
  }
}

function select(threads: ListedThread[], cursors: Record<string, ThreadCursor> = {}) {
  return selectThreads({
    threads,
    cursors: new Map(Object.entries(cursors)),
    githubNotificationsSince: SINCE,
  })
}

// domain-model.md 5.: GitHub の通知の since は「前回の成功の時刻 − 5分」と「今 − 出来事の一覧の日数」の新しい方
describe('GitHub の通知の since（domain-model.md 5.）', () => {
  it.each([
    ['前回の成功が無い（初回・壊れて捨てた）→ 今 − 日数', undefined, 7, '2026-01-24T00:00:00.000Z'],
    ['前回の成功 − 5分の方が新しい', '2026-01-30T12:00:00Z', 7, '2026-01-30T11:55:00.000Z'],
    [
      '今 − 日数の方が新しい（長く閉じていた）',
      '2026-01-10T00:00:00Z',
      7,
      '2026-01-24T00:00:00.000Z',
    ],
    [
      '境目: 前回の成功 − 5分が、今 − 日数ちょうど',
      '2026-01-24T00:05:00Z',
      7,
      '2026-01-24T00:00:00.000Z',
    ],
    ['日数は出来事の一覧の日数（3日）', undefined, 3, '2026-01-28T00:00:00.000Z'],
  ])('%s', (_name, lastSuccessAt, eventDays, expected) => {
    expect(githubNotificationsSince({ lastSuccessAt, now: NOW, eventDays })).toBe(expected)
  })
})

// domain-model.md 4.1「分解するスレッド」
describe('分解するスレッドを理由と種類で選ぶ（domain-model.md 4.1）', () => {
  it.each(['review_requested', 'author', 'comment', 'mention', 'team_mention', 'assign'])(
    '理由 %s の PR・issue は GraphQL で分解する',
    (reason) => {
      expect(
        select([
          thread({ id: 'pr', reason }),
          thread({ id: 'issue', reason, subjectType: 'Issue', subjectUrl: ISSUE_URL }),
        ]),
      ).toEqual([
        {
          id: 'pr',
          route: { kind: 'pull_request', owner: 'example-org', name: 'app', number: 101 },
          since: SINCE,
        },
        {
          id: 'issue',
          route: { kind: 'issue', owner: 'example-org', name: 'docs', number: 120 },
          since: SINCE,
        },
      ])
    },
  )

  it('理由 ci_activity の CheckSuite は CI の結果として分解する（subject.url は空）', () => {
    expect(
      select([thread({ reason: 'ci_activity', subjectType: 'CheckSuite', subjectUrl: null })]),
    ).toEqual([{ id: '100', route: { kind: 'ci' }, since: SINCE }])
  })

  it.each([
    'subscribed',
    'manual',
    'state_change',
    'your_activity',
    'approval_requested',
    'security_alert',
    'invitation',
    'member_feature_requested',
    'security_advisory_credit',
    'unknown_new_reason',
  ])('理由 %s は分解しない', (reason) => {
    expect(select([thread({ reason })])).toEqual([])
  })

  it.each([
    ['Discussion（F-04 を入れるときに足す）', { subjectType: 'Discussion' }],
    ['Release', { subjectType: 'Release', subjectUrl: null }],
    ['ci_activity でも CheckSuite でない', { reason: 'ci_activity' }],
    ['CheckSuite でも ci_activity でない', { subjectType: 'CheckSuite', subjectUrl: null }],
    ['PR なのに subject.url が空', { subjectUrl: null }],
    ['subject.url が api.github.com の外', { subjectUrl: 'https://example.com/repos/o/r/pulls/1' }],
    [
      'subject.url が PR・issue の形でない',
      { subjectUrl: 'https://api.github.com/repos/o/r/commits/abc' },
    ],
    ['subject.url の番号が数でない', { subjectUrl: 'https://api.github.com/repos/o/r/pulls/abc' }],
    ['subject.url が URL でない', { subjectUrl: 'not a url' }],
  ])('%s は分解しない', (_name, change) => {
    expect(select([thread(change)])).toEqual([])
  })

  it('PR か issue かは subject.url で決める（github-api.md 2.）', () => {
    expect(
      select([thread({ subjectType: 'PullRequest', subjectUrl: ISSUE_URL })])[0]?.route,
    ).toEqual({ kind: 'issue', owner: 'example-org', name: 'docs', number: 120 })
  })

  it('記録した GitHub の通知（50件）は、すべて GraphQL で分解する（PR 47・issue 3）', () => {
    const selected = select(recordedGitHubNotificationThreads())
    expect(selected).toHaveLength(50)
    expect(selected.filter((item) => item.route.kind === 'pull_request')).toHaveLength(47)
    expect(selected.filter((item) => item.route.kind === 'issue')).toHaveLength(3)
  })

  it('記録した本リポジトリの GitHub の通知では、ci_activity だけを選び、state_change は選ばない', () => {
    expect(select(recordedCiGitHubNotificationThreads())).toEqual([
      { id: '10867329022', route: { kind: 'ci' }, since: SINCE },
    ])
  })
})

// domain-model.md 5.「スレッドごとの取り込みの記録」
describe('スレッドごとの since と、更新されていないスレッド（domain-model.md 5.）', () => {
  const expandedUntil = '2026-01-30T23:30:00Z'

  it.each([
    ['記録が無い → GitHub の通知の since', undefined, '2026-01-30T23:45:00Z', SINCE],
    [
      '記録がある → 分解した時刻 − 5分',
      { expandedUntil, consecutiveFailures: 0 },
      '2026-01-30T23:45:00Z',
      '2026-01-30T23:25:00.000Z',
    ],
    [
      '境目: 更新時刻が分解した時刻の1秒後 → 分解する',
      { expandedUntil, consecutiveFailures: 0 },
      '2026-01-30T23:30:01Z',
      '2026-01-30T23:25:00.000Z',
    ],
    [
      '前回失敗した（続けて失敗した回数が1以上）→ 更新されていなくてもやり直す',
      { expandedUntil, consecutiveFailures: 1 },
      '2026-01-30T23:00:00Z',
      '2026-01-30T23:25:00.000Z',
    ],
  ])('%s', (_name, cursor, updatedAt, since) => {
    const cursors: Record<string, ThreadCursor> = cursor === undefined ? {} : { '100': cursor }
    expect(select([thread({ updatedAt })], cursors)).toEqual([
      expect.objectContaining({ id: '100', since }),
    ])
  })

  it.each([
    ['境目: 更新時刻が分解した時刻ちょうど', '2026-01-30T23:30:00Z'],
    ['更新時刻が分解した時刻より前', '2026-01-30T23:00:00Z'],
  ])('%s → 分解しない（もう分解した）', (_name, updatedAt) => {
    expect(
      select([thread({ updatedAt })], { '100': { expandedUntil, consecutiveFailures: 0 } }),
    ).toEqual([])
  })

  it('CI のスレッドにも同じ決まりを当てる', () => {
    const ci = thread({
      reason: 'ci_activity',
      subjectType: 'CheckSuite',
      subjectUrl: null,
      updatedAt: '2026-01-30T23:45:00Z',
    })
    expect(select([ci], { '100': { expandedUntil, consecutiveFailures: 0 } })).toEqual([
      { id: '100', route: { kind: 'ci' }, since: '2026-01-30T23:25:00.000Z' },
    ])
  })
})
