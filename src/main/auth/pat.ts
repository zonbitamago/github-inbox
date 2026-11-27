// PAT の確認（auth-flow.md 3.）。保存してよいかを、GET /user の結果から決める。
import type { IpcErrorCode } from '../../shared/ipc-contract'
import type { ViewerResult } from '../github/viewer'

export type PatFailureCode = Extract<
  IpcErrorCode,
  'pat_invalid' | 'pat_missing_scope' | 'offline' | 'rate_limited' | 'github_error'
>

export type PatJudgement = { ok: true; login: string } | { ok: false; code: PatFailureCode }

/** 貼られた文字の前後の空白を除く（コピーしたときに改行が付くことがあるため） */
export function normalizePat(input: string): string {
  return input.trim()
}

export function judgePat(result: ViewerResult): PatJudgement {
  if (result.kind === 'failed') {
    switch (result.failure.kind) {
      case 'auth_failed':
        return { ok: false, code: 'pat_invalid' }
      case 'offline':
        return { ok: false, code: 'offline' }
      case 'rate_limited':
        return { ok: false, code: 'rate_limited' }
      case 'not_accessible':
      case 'github_error':
        return { ok: false, code: 'github_error' }
    }
  }
  // repo があれば GitHub の通知 API も読める。ヘッダーが無いもの（fine-grained PAT）は使えない（ADR-002）
  if (result.scopes === null || !result.scopes.includes('repo')) {
    return { ok: false, code: 'pat_missing_scope' }
  }
  return { ok: true, login: result.login }
}
