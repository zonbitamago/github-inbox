// ブラウザで開く（component-backend.md 8.、security-rules.md S-06）。
// 外で開くのはこのファイルだけ（ESLint で止める）。URL の検査（core/url-guard、I-8）を通したものだけを開く。
// クリップボード（F-34）は S5・S6 で足す。
import { shell } from 'electron'
import type { Result } from '../../shared/ipc-contract'
import { isGitHubUrl } from '../core/url-guard'

export type Opener = (url: string) => Promise<void>

/** テストでは開く関数を差し替える */
export function createGitHubOpener(
  open: Opener = (url) => shell.openExternal(url),
): (url: string) => Promise<Result<undefined>> {
  return async (url) => {
    if (!isGitHubUrl(url)) return { ok: false, error: { code: 'url_not_allowed' } }
    await open(url)
    return { ok: true, value: undefined }
  }
}
