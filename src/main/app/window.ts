import { join } from 'node:path'
import { BrowserWindow } from 'electron'

// 画面の設定は security-rules.md S-03（ADR-007）。値を緩めるときは技術者に聞く。
export function createMainWindow(): BrowserWindow {
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

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}
