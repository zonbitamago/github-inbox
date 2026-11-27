// 問い合わせの予定（component-backend.md 6.1）。次に問い合わせるまでの時間を、その回の結果と利用制限の残りから決める。
import {
  POLL_INTERVAL_MS,
  RATE_LIMIT_LOW_REMAINING,
  SLOW_POLL_INTERVAL_MS,
} from '../core/constants'
import type { GitHubFailure } from '../github/client'
import type { RateBudget } from '../github/rate-budget'

/** やり直しの予約（テストで偽物に差し替える）。戻り値を呼ぶと取り消す */
export interface Timer {
  schedule(callback: () => void, delayMs: number): () => void
}

export type CycleOutcome =
  | { kind: 'ok' }
  | { kind: 'failed'; failure: GitHubFailure }
  /** GitHub の外の失敗（保存できなかったなど）。受け取りの状態は変えず、次の回にやり直す */
  | { kind: 'error' }

const SECOND_MS = 1000
/** 利用制限の枠（REST と GraphQL は別々。component-backend.md 6.2） */
const RESOURCES = ['core', 'graphql'] as const

/** REST・GraphQL のどちらかの残りが500を切っているか。枠が戻る時刻を過ぎていれば、少なくないとする */
export function isRateLimitLow(rateBudget: Pick<RateBudget, 'remaining'>, now: Date): boolean {
  return RESOURCES.some((resource) => {
    const limit = rateBudget.remaining(resource)
    return limit !== undefined && limit.resetAt > now && limit.remaining < RATE_LIMIT_LOW_REMAINING
  })
}

/** 次に問い合わせるまでの時間（ミリ秒）。undefined なら止める（認証が切れた。認証し直すまで再開しない） */
export function nextPollDelay(input: {
  outcome: CycleOutcome
  /** 前回の GitHub の通知の応答の X-Poll-Interval（秒） */
  pollIntervalSeconds: number | undefined
  rateLimitLow: boolean
  now: Date
}): number | undefined {
  const { outcome } = input
  if (outcome.kind === 'failed') {
    switch (outcome.failure.kind) {
      case 'auth_failed':
        return undefined
      case 'rate_limited':
        // 指示された時刻まで止める
        return Math.max(0, outcome.failure.retryAt.getTime() - input.now.getTime())
      case 'offline':
      case 'github_error':
      case 'not_accessible':
        // ネットワーク・GitHub の障害は60秒のまま（6.1）
        return POLL_INTERVAL_MS
    }
  }
  // X-Poll-Interval より短くしない（github-api.md 2.）
  const interval = Math.max(POLL_INTERVAL_MS, (input.pollIntervalSeconds ?? 0) * SECOND_MS)
  return input.rateLimitLow ? Math.max(interval, SLOW_POLL_INTERVAL_MS) : interval
}
