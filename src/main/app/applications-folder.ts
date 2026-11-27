// アプリケーションフォルダへの移動（F-36 (1)、AC-41、component-backend.md 8.）。Mac だけ。
// Electron の app.moveToApplicationsFolder は、移せたらアプリを終えて、移した先で開き直す（そのため成功の答えは画面に届かないことがある）。
// 利用者が許可の確認でやめたら false が返り、ほかの理由で移せなければ例外が出る。
// 開発用の立ち上げでは、移す対象が Electron そのものになるため、移さない（⑭ S6b）。
import type { InvokeResult } from '../../shared/ipc-contract'
import type { Logger } from '../log/logger'

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export interface ApplicationsFolderMoverDeps {
  platform: 'darwin' | 'win32'
  /** 配布物として動いているか（app.isPackaged） */
  packaged: boolean
  isInApplicationsFolder: () => boolean
  move: () => boolean
  logger: Logger
}

export function createApplicationsFolderMover(
  deps: ApplicationsFolderMoverDeps,
): () => Promise<InvokeResult<'onboarding:moveToApplicationsFolder'>> {
  return () => {
    if (deps.platform !== 'darwin' || !deps.packaged) {
      return Promise.resolve({ ok: false, error: { code: 'not_supported' } })
    }
    // もう移してあれば何もしない
    if (deps.isInApplicationsFolder()) return Promise.resolve({ ok: true, value: undefined })
    try {
      if (deps.move()) {
        deps.logger.info('app.moved_to_applications_folder')
        return Promise.resolve({ ok: true, value: undefined })
      }
      deps.logger.info('app.move_to_applications_folder_cancelled')
    } catch (error) {
      deps.logger.error('app.move_to_applications_folder_failed', { error: errorName(error) })
    }
    return Promise.resolve({ ok: false, error: { code: 'internal' } })
  }
}
