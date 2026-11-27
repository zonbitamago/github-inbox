import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it } from 'vitest'
import { applicationMenuTemplate } from './window'

/** メニューの項目を、入れ子も含めて平らにする */
function flatten(items: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) =>
    Array.isArray(item.submenu) ? [item, ...flatten(item.submenu)] : [item],
  )
}

const roles = (template: MenuItemConstructorOptions[] | null) =>
  flatten(template ?? []).map((item) => item.role ?? item.label)

// component-backend.md 8.「メニュー」、component-frontend.md 5.「キーボード」
describe('メニュー', () => {
  it('配布物の Mac は、アプリ・編集・窓だけ（再読み込みと開発者ツールは外す）', () => {
    expect(roles(applicationMenuTemplate({ packaged: true, platform: 'darwin' }))).toEqual([
      'appMenu',
      'editMenu',
      'windowMenu',
    ])
  })

  it('配布物の Windows は、メニューを出さない', () => {
    expect(applicationMenuTemplate({ packaged: true, platform: 'win32' })).toBeNull()
  })

  it.each(['darwin', 'win32'] satisfies NodeJS.Platform[])(
    '開発中（%s）も、Cmd+R・Ctrl+R の再読み込みは入れない（PR の一覧のリロードに使う）',
    (platform) => {
      const items = roles(applicationMenuTemplate({ packaged: false, platform }))
      expect(items).toContain('toggleDevTools')
      expect(items).toContain('forceReload')
      expect(items).not.toContain('reload')
      expect(items).not.toContain('viewMenu')
    },
  )
})
