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
 * メニュー（component-backend.md 8.）。配布物では、画面ごとの再読み込みと開発者ツールを外す。
 * Mac はコピー・貼り付けのためにアプリと編集と窓のメニューを残す。Windows はメニューを出さない。
 * 開発中は Electron の既定のメニューのままにする。
 */
export function applyApplicationMenu(options: {
  packaged: boolean
  platform: NodeJS.Platform
}): void {
  if (!options.packaged) return
  const template: MenuItemConstructorOptions[] =
    options.platform === 'darwin'
      ? [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]
      : []
  Menu.setApplicationMenu(template.length === 0 ? null : Menu.buildFromTemplate(template))
}
