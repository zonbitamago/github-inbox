// 受け取りの状態（IngestState）の移り変わり（component-backend.md 6.3、N-08、Q-06）。
// 認証が切れた・利用制限はすぐ出す。つながらない・GitHub の障害は、続けて2回で出す（1回だけならそれまでの状態のまま）。
import type { AppState } from '../../shared/ipc-contract'
import { FAILURES_BEFORE_SHOWN } from '../core/constants'
import type { GitHubFailure } from '../github/client'

export type IngestView = AppState['ingest']

export class IngestStatus {
  private consecutiveFailures = 0
  private lastSuccessAt: string | undefined
  private view: IngestView = { state: 'syncing' }

  current(): IngestView {
    return this.view
  }

  /** 取り込み中（立ち上げ時・サインインした後の取り戻し。Q-03） */
  syncing(): IngestView {
    return this.show({ state: 'syncing' })
  }

  /** 成功（304 を含む）。次の成功ですぐ知らせを消す */
  succeeded(at: Date): IngestView {
    this.consecutiveFailures = 0
    this.lastSuccessAt = at.toISOString()
    return this.show({ state: 'ok' })
  }

  failed(failure: GitHubFailure): IngestView {
    switch (failure.kind) {
      case 'auth_failed':
        return this.show({ state: 'auth_failed' })
      case 'rate_limited':
        return this.show({ state: 'rate_limited', retryAt: failure.retryAt.toISOString() })
      case 'offline':
      case 'github_error':
        this.consecutiveFailures += 1
        if (this.consecutiveFailures < FAILURES_BEFORE_SHOWN) return this.view
        return this.show({ state: failure.kind })
      case 'not_accessible':
        // 1つのリポジトリだけの失敗は、受け取りの状態を変えない（6.3）
        return this.view
    }
  }

  private show(view: Omit<IngestView, 'lastSuccessAt'>): IngestView {
    this.view = {
      ...view,
      ...(this.lastSuccessAt === undefined ? {} : { lastSuccessAt: this.lastSuccessAt }),
    }
    return this.view
  }
}
