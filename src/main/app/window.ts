import { join } from 'node:path'
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

// 画面の設定は security-rules.md S-03（ADR-007）。値を緩めるときは技術者に聞く。
// devServerUrl は開発中だけ渡す（配布物では、環境変数から別のページを読ませないように渡さない）。
export function createMainWindow(options: { devServerUrl?: string }): BrowserWindow {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  // 画面から別の URL へ移ること・新しい窓を開くことを止める（S-03）。
  // 外の URL を開くのは src/main/app/external.ts だけ（S-06）。
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  window.once('ready-to-show', () => {
    window.show()
  })

  if (options.devServerUrl !== undefined) {
    void window.loadURL(options.devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

/**
 * メニュー（component-backend.md 8.）。画面ごとの再読み込み（Cmd+R・Ctrl+R）は、開発中も配布物も入れない。
 * Cmd+R は PR の一覧のリロードに使うため（component-frontend.md 5.「キーボード」。⑭ S6a）。
 * 配布物: Mac はコピー・貼り付けのためにアプリと編集と窓のメニューを残し、開発者ツールは外す。Windows はメニューを出さない。
 * 開発中: 上に加えて、開発者ツールと強制の再読み込み（Shift+Cmd+R）だけを置く。
 * null はメニューを出さない。
 */
export function applicationMenuTemplate(options: {
  packaged: boolean
  platform: NodeJS.Platform
}): MenuItemConstructorOptions[] | null {
  const develop: MenuItemConstructorOptions[] = options.packaged
    ? []
    : [{ label: '開発', submenu: [{ role: 'toggleDevTools' }, { role: 'forceReload' }] }]
  if (options.platform === 'darwin') {
    return [{ role: 'appMenu' }, { role: 'editMenu' }, ...develop, { role: 'windowMenu' }]
  }
  return develop.length === 0 ? null : develop
}

export function applyApplicationMenu(options: {
  packaged: boolean
  platform: NodeJS.Platform
}): void {
  const template = applicationMenuTemplate(options)
  Menu.setApplicationMenu(template === null ? null : Menu.buildFromTemplate(template))
}
