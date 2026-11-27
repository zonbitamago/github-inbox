// 利用制限の管理（component-backend.md 6.2、Q-04）。
// REST と GraphQL は別々の枠を持つため、応答のヘッダー（x-ratelimit-*）から枠ごとの残りを覚える。
// 同時に投げる問い合わせは、REST と GraphQL を合わせて4本までにする。
import { MAX_CONCURRENT_GITHUB_REQUESTS } from '../core/constants'

export interface RateLimitRemaining {
  remaining: number
  resetAt: Date
}

const SECOND_MS = 1000

function numberHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name)
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export class RateBudget {
  private readonly limits = new Map<string, RateLimitRemaining>()
  /** retry-after（二次的な利用制限）で、全部の枠を止める時刻 */
  private retryAfterUntil: Date | undefined
  private running = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly maxConcurrent = MAX_CONCURRENT_GITHUB_REQUESTS) {}

  /** 枠が空くまで待ってから仕事を動かす。仕事が失敗しても枠を返す */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else {
      this.running += 1
    }
    try {
      return await task()
    } finally {
      const next = this.waiting.shift()
      // 待っている仕事があれば、枠をそのまま渡す（数は変えない）
      if (next === undefined) this.running -= 1
      else next()
    }
  }

  /** 応答のヘッダーから残りと止める時刻を覚える */
  observe(headers: Headers, now: Date): void {
    const resource = headers.get('x-ratelimit-resource')
    const remaining = numberHeader(headers, 'x-ratelimit-remaining')
    const reset = numberHeader(headers, 'x-ratelimit-reset')
    if (resource !== null && remaining !== undefined && reset !== undefined) {
      this.limits.set(resource, { remaining, resetAt: new Date(reset * SECOND_MS) })
    }
    const retryAfter = numberHeader(headers, 'retry-after')
    if (retryAfter !== undefined) {
      this.retryAfterUntil = new Date(now.getTime() + retryAfter * SECOND_MS)
    }
  }

  remaining(resource: string): RateLimitRemaining | undefined {
    return this.limits.get(resource)
  }

  /** その枠に投げてはいけない間なら、投げてよくなる時刻を返す（component-backend.md 6.1） */
  blockedUntil(resource: string, now: Date): Date | undefined {
    const candidates: Date[] = []
    if (this.retryAfterUntil !== undefined && this.retryAfterUntil > now) {
      candidates.push(this.retryAfterUntil)
    }
    const limit = this.limits.get(resource)
    if (limit !== undefined && limit.remaining <= 0 && limit.resetAt > now) {
      candidates.push(limit.resetAt)
    }
    if (candidates.length === 0) return undefined
    return new Date(Math.max(...candidates.map((date) => date.getTime())))
  }
}
