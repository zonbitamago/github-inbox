import { describe, expect, it } from 'vitest'
import { RateBudget } from './rate-budget'

const NOW = new Date('2026-01-01T00:00:00Z')

function headers(values: Record<string, string>): Headers {
  return new Headers(values)
}

/** 外から終わらせられる仕事 */
function deferred() {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('同時に投げる数（component-backend.md 6.2、Q-04）', () => {
  it('4本までは同時に動き、5本目は1本終わるまで待つ', async () => {
    const budget = new RateBudget()
    const tasks = Array.from({ length: 5 }, () => deferred())
    const started: number[] = []
    const runs = tasks.map((task, index) =>
      budget.run(async () => {
        started.push(index)
        await task.promise
      }),
    )
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2, 3])

    tasks[0]?.resolve()
    await runs[0]
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2, 3, 4])

    for (const task of tasks) task.resolve()
    await Promise.all(runs)
  })

  it('仕事が失敗しても枠を返す', async () => {
    const budget = new RateBudget(1)
    await expect(budget.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(budget.run(() => Promise.resolve('next'))).resolves.toBe('next')
  })
})

describe('利用制限の残り（component-backend.md 6.2）', () => {
  it('応答のヘッダーから、枠ごとの残りと戻る時刻を覚える', () => {
    const budget = new RateBudget()
    budget.observe(
      headers({
        'x-ratelimit-resource': 'core',
        'x-ratelimit-remaining': '4868',
        'x-ratelimit-reset': '1767229200',
      }),
      NOW,
    )
    budget.observe(
      headers({
        'x-ratelimit-resource': 'graphql',
        'x-ratelimit-remaining': '4990',
        'x-ratelimit-reset': '1767229800',
      }),
      NOW,
    )
    expect(budget.remaining('core')).toEqual({
      remaining: 4868,
      resetAt: new Date('2026-01-01T01:00:00Z'),
    })
    expect(budget.remaining('graphql')?.remaining).toBe(4990)
    expect(budget.remaining('search')).toBeUndefined()
  })

  it.each([
    ['ヘッダーが無い', {}],
    ['数でない', { 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': 'many' }],
    ['枠の名前が無い', { 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '1767229200' }],
  ])('%s ときは何も覚えない', (_name, values) => {
    const budget = new RateBudget()
    budget.observe(headers(values), NOW)
    expect(budget.remaining('core')).toBeUndefined()
  })
})

describe('止める時刻（component-backend.md 6.1）', () => {
  it('残りが0の枠は、戻る時刻まで止める。ほかの枠は止めない', () => {
    const budget = new RateBudget()
    budget.observe(
      headers({
        'x-ratelimit-resource': 'core',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1767229200',
      }),
      NOW,
    )
    expect(budget.blockedUntil('core', NOW)).toEqual(new Date('2026-01-01T01:00:00Z'))
    expect(budget.blockedUntil('graphql', NOW)).toBeUndefined()
    expect(budget.blockedUntil('core', new Date('2026-01-01T01:00:00Z'))).toBeUndefined()
  })

  it('retry-after を受けたら、その秒数だけ全部の枠を止める（二次的な利用制限）', () => {
    const budget = new RateBudget()
    budget.observe(headers({ 'retry-after': '60' }), NOW)
    expect(budget.blockedUntil('core', NOW)).toEqual(new Date('2026-01-01T00:01:00Z'))
    expect(budget.blockedUntil('graphql', NOW)).toEqual(new Date('2026-01-01T00:01:00Z'))
    expect(budget.blockedUntil('core', new Date('2026-01-01T00:01:00Z'))).toBeUndefined()
  })

  it('枠の止める時刻と retry-after の両方があれば、遅い方まで止める', () => {
    const budget = new RateBudget()
    budget.observe(
      headers({
        'x-ratelimit-resource': 'core',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1767229200',
        'retry-after': '60',
      }),
      NOW,
    )
    expect(budget.blockedUntil('core', NOW)).toEqual(new Date('2026-01-01T01:00:00Z'))
  })
})
