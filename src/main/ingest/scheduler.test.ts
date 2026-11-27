import { describe, expect, it } from 'vitest'
import { RateBudget } from '../github/rate-budget'
import { isRateLimitLow, nextPollDelay, type CycleOutcome } from './scheduler'

const NOW = new Date('2026-01-31T00:00:00Z')
const MINUTE = 60_000

function delay(outcome: CycleOutcome, pollIntervalSeconds?: number, rateLimitLow = false) {
  return nextPollDelay({ outcome, pollIntervalSeconds, rateLimitLow, now: NOW })
}

// component-backend.md 6.1「間隔」
describe('次に問い合わせるまでの時間（component-backend.md 6.1）', () => {
  it.each([
    ['平常は60秒', undefined, 60],
    ['X-Poll-Interval がより長ければそれ', 120, 120],
    ['X-Poll-Interval が短くても60秒より短くしない', 30, 60],
    ['境目: X-Poll-Interval が60秒', 60, 60],
  ])('%s', (_name, seconds, expected) => {
    expect(delay({ kind: 'ok' }, seconds)).toBe(expected * 1000)
  })

  it.each([
    ['利用制限の残りが少なければ4分', undefined, 4 * MINUTE],
    ['X-Poll-Interval が4分より長ければそれ', 300, 5 * MINUTE],
  ])('%s', (_name, seconds, expected) => {
    expect(delay({ kind: 'ok' }, seconds, true)).toBe(expected)
  })

  it.each([
    ['つながらない', { kind: 'offline' }],
    ['GitHub の障害', { kind: 'github_error', status: 500 }],
    ['入れない', { kind: 'not_accessible', status: 403 }],
  ] as const)('%s → 60秒のまま', (_name, failure) => {
    expect(delay({ kind: 'failed', failure }, 120)).toBe(MINUTE)
  })

  it('GitHub の外の失敗（保存できなかった）→ X-Poll-Interval どおり', () => {
    expect(delay({ kind: 'error' }, 90)).toBe(90_000)
  })

  it.each([
    ['指示された時刻まで止める', new Date('2026-01-31T00:05:00Z'), 5 * MINUTE],
    ['時刻を過ぎていれば、すぐ', new Date('2026-01-30T23:59:00Z'), 0],
  ])('利用制限: %s', (_name, retryAt, expected) => {
    expect(delay({ kind: 'failed', failure: { kind: 'rate_limited', retryAt } })).toBe(expected)
  })

  it('認証が切れたら止める（認証し直すまで再開しない）', () => {
    expect(delay({ kind: 'failed', failure: { kind: 'auth_failed' } })).toBeUndefined()
  })
})

describe('利用制限の残りが少ないか（component-backend.md 6.1、Q-04）', () => {
  function budgetWith(resource: string, remaining: number, resetAt = '2026-01-31T00:30:00Z') {
    const budget = new RateBudget()
    budget.observe(
      new Headers({
        'x-ratelimit-resource': resource,
        'x-ratelimit-remaining': String(remaining),
        'x-ratelimit-reset': String(Date.parse(resetAt) / 1000),
      }),
      NOW,
    )
    return budget
  }

  it.each([
    ['REST の残りが499', 'core', 499, true],
    ['境目: REST の残りが500', 'core', 500, false],
    ['GraphQL の残りが100', 'graphql', 100, true],
    ['検索の枠は見ない', 'search', 0, false],
  ])('%s → %s', (_name, resource, remaining, expected) => {
    expect(isRateLimitLow(budgetWith(resource, remaining), NOW)).toBe(expected)
  })

  it('枠が戻る時刻を過ぎていれば、少なくないとする', () => {
    expect(isRateLimitLow(budgetWith('core', 10, '2026-01-30T23:00:00Z'), NOW)).toBe(false)
  })

  it('まだ応答を受けていなければ、少なくないとする', () => {
    expect(isRateLimitLow(new RateBudget(), NOW)).toBe(false)
  })
})
