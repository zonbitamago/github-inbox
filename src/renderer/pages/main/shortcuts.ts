// キーボードの割り当て（component-frontend.md 5.「キーボード」。AI案。要件に無い追加のため、⑮ で依頼者に見せ、要らなければ外す。DR-03）。
// Mac は Cmd、Windows は Ctrl。Shift・Alt を一緒に押したときは何もしない（Shift+Cmd+R の強制の再読み込みなどとぶつけない）。

export type Shortcut = 'reload' | 'search' | 'settings'

/** KeyboardEvent のうち使うもの */
export interface ShortcutKey {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const SHORTCUTS: Record<string, Shortcut> = { r: 'reload', f: 'search', ',': 'settings' }

export function shortcutOf(event: ShortcutKey, platform: 'darwin' | 'win32'): Shortcut | undefined {
  const command = platform === 'darwin' ? event.metaKey : event.ctrlKey
  const other = platform === 'darwin' ? event.ctrlKey : event.metaKey
  if (!command || other || event.altKey || event.shiftKey) return undefined
  return SHORTCUTS[event.key.toLowerCase()]
}
