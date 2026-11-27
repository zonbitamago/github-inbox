// 受け取れていないことの知らせ（component-frontend.md 2.2 の IngestStatusBanner・5.「知らせの優先順」、N-08）。
// どの知らせを出すかを、部品から切り離した関数で決める。
import type { AppState } from '../../../shared/ipc-contract'

export type IngestNoticeKind =
  'auth_failed' | 'rate_limited' | 'offline' | 'github_error' | 'syncing'

export interface IngestNotice {
  kind: IngestNoticeKind
  /** 利用制限で再開する時刻 */
  retryAt?: string
  /** 最後に受け取れた時刻 */
  lastSuccessAt?: string
}

/**
 * 出す知らせを1つ選ぶ。認証が切れた → 利用制限 → つながらない → GitHub の障害 → 取り込み中 の順。
 * 受け取れている（ok）・サインインしていないときは出さない
 */
export function selectIngestNotice(state: Pick<AppState, 'auth' | 'ingest'>): IngestNotice | null {
  const { ingest } = state
  const times = {
    ...(ingest.retryAt === undefined ? {} : { retryAt: ingest.retryAt }),
    ...(ingest.lastSuccessAt === undefined ? {} : { lastSuccessAt: ingest.lastSuccessAt }),
  }
  if (state.auth.status === 'auth_failed' || ingest.state === 'auth_failed') {
    return { kind: 'auth_failed', ...times }
  }
  switch (ingest.state) {
    case 'rate_limited':
    case 'offline':
    case 'github_error':
    case 'syncing':
      return { kind: ingest.state, ...times }
    case 'ok':
    case 'signed_out':
      return null
  }
}
