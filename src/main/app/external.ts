// ブラウザで開く（component-backend.md 8.、security-rules.md S-06）。
// 外で開くのはこのファイルだけ（ESLint で止める）。URL の検査（core/url-guard、I-8）を通したものだけを開く。
// OS の設定画面は、メインが OS ごとに決めた固定の先だけを開く（画面から URL は受け取らない。S-06）。
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

/** OS のデスクトップ通知の設定画面（N-09・F-36 (4)）。Mac は macOS 13 以降のシステム設定の「通知」 */
const DESKTOP_NOTIFICATION_SETTINGS_URLS = {
  darwin: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  win32: 'ms-settings:notifications',
} as const

export function createDesktopNotificationSettingsOpener(
  platform: 'darwin' | 'win32',
  open: Opener = (url) => shell.openExternal(url),
): () => Promise<Result<undefined>> {
  return async () => {
    await open(DESKTOP_NOTIFICATION_SETTINGS_URLS[platform])
    return { ok: true, value: undefined }
  }
}
