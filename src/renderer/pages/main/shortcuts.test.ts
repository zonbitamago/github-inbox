import { describe, expect, it } from 'vitest'
import { shortcutOf, type Shortcut, type ShortcutKey } from './shortcuts'

const key = (change: Partial<ShortcutKey>): ShortcutKey => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...change,
})

// component-frontend.md 5.「キーボード」（AI案。⑮ で依頼者に見せる。DR-03）
describe('キーボードの割り当て', () => {
  it.each<[string, 'darwin' | 'win32', Partial<ShortcutKey>, Shortcut | undefined]>([
    ['Mac: Cmd+R で PR の一覧をリロード', 'darwin', { key: 'r', metaKey: true }, 'reload'],
    ['Mac: Cmd+F で検索欄へ', 'darwin', { key: 'f', metaKey: true }, 'search'],
    ['Mac: Cmd+, で設定', 'darwin', { key: ',', metaKey: true }, 'settings'],
    ['Mac: 大文字（Caps Lock）でも同じ', 'darwin', { key: 'R', metaKey: true }, 'reload'],
    ['Mac: Ctrl+R は何もしない', 'darwin', { key: 'r', ctrlKey: true }, undefined],
    [
      'Mac: Shift+Cmd+R（強制の再読み込み）は何もしない',
      'darwin',
      { key: 'r', metaKey: true, shiftKey: true },
      undefined,
    ],
    ['Mac: Alt+Cmd+F は何もしない', 'darwin', { key: 'f', metaKey: true, altKey: true }, undefined],
    ['Mac: R だけは何もしない', 'darwin', { key: 'r' }, undefined],
    ['Mac: ほかのキーは何もしない', 'darwin', { key: 'c', metaKey: true }, undefined],
    ['Windows: Ctrl+R で PR の一覧をリロード', 'win32', { key: 'r', ctrlKey: true }, 'reload'],
    ['Windows: Ctrl+F で検索欄へ', 'win32', { key: 'f', ctrlKey: true }, 'search'],
    ['Windows: Ctrl+, で設定', 'win32', { key: ',', ctrlKey: true }, 'settings'],
    ['Windows: Win+R（meta）は何もしない', 'win32', { key: 'r', metaKey: true }, undefined],
  ])('%s', (_name, platform, change, expected) => {
    expect(shortcutOf(key(change), platform)).toBe(expected)
  })
})
