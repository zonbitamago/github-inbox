// 自動起動（F-25、component-backend.md 8.）。app.setLoginItemSettings で変え、OS から読み直した値を返す。
// Windows では確かめていない（D-021）。
import type { Result } from '../../shared/ipc-contract'

export interface LoginItemDeps {
  set: (enabled: boolean) => void
  /** OS のログイン項目に入っているか */
  get: () => boolean
  /** AppState.loginItem を変える（state:changed） */
  publish: (enabled: boolean) => void
}

export function createLoginItemSetter(
  deps: LoginItemDeps,
): (args: { enabled: boolean }) => Promise<Result<{ enabled: boolean }>> {
  return ({ enabled }) => {
    deps.set(enabled)
    // OS が受け付けたかは、読み直して確かめる
    const actual = deps.get()
    deps.publish(actual)
    return Promise.resolve({ ok: true, value: { enabled: actual } })
  }
}
