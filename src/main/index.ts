// 組み立てと立ち上げの順番（component-backend.md 5.1）。S1 は保存・ログ・窓・IPC の受け口まで。
// 認証（S2）・取り込み（S3）・デスクトップ通知（S4）・PR の一覧（S5）は、各スライスで足していく。
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, ipcMain, type BrowserWindow } from 'electron'
import { DAY_MS } from './core/constants'
import { AppStateHolder } from './app/app-state'
import { applyApplicationMenu, createMainWindow } from './app/window'
import { createPusher, createSenderCheck, registerInvokeHandlers } from './ipc/handlers'
import { createLogger } from './log/logger'
import { EventsStore } from './store/events-store'
import { SettingsStore } from './store/settings-store'

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

let mainWindow: BrowserWindow | null = null

async function start(): Promise<void> {
  const userData = app.getPath('userData')
  const logger = createLogger({ dir: join(userData, 'logs') })
  const now = () => new Date()
  logger.info('app.start', { version: app.getVersion(), platform: process.platform })
  logger
    .removeOldFiles()
    .catch((error: unknown) => logger.warn('log.cleanup_failed', { error: errorName(error) }))

  // 設定を読む（無い・壊れていれば既定値）
  const settingsStore = new SettingsStore(join(userData, 'settings.json'), logger)
  const settings = await settingsStore.load(now())

  // 保存済みの出来事を読む。窓を開くのと並べて行い、ネットワークを待たない（Q-03、DR-05）
  const eventsStore = new EventsStore(join(userData, 'events.json'), logger)
  const eventsLoaded = eventsStore.load(now())
  eventsLoaded.catch((error: unknown) =>
    logger.error('store.load_failed', { file: 'events.json', error: errorName(error) }),
  )

  const pusher = createPusher(() => mainWindow?.webContents ?? null, logger)
  const platform = process.platform === 'win32' ? 'win32' : 'darwin'
  const state = new AppStateHolder(
    {
      version: app.getVersion(),
      platform,
      inApplicationsFolder: platform === 'darwin' ? app.isInApplicationsFolder() : null,
      settings,
      loginItemEnabled: app.getLoginItemSettings().openAtLogin,
      // 認証は S2 で足す。それまでは使い始めの案内を出す
      auth: { status: 'signed_out' },
      ingest: { state: 'signed_out' },
      desktopNotification: {},
      prList: { loading: false },
    },
    (next) => pusher.send('state:changed', next),
  )

  // 開発中だけ開発サーバーを読む（配布物では環境変数を見ない）
  const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
  registerInvokeHandlers(
    {
      ipcMain,
      isTrustedSender: createSenderCheck({
        indexFileUrl: pathToFileURL(join(__dirname, '../renderer/index.html')).href,
        ...(devServerUrl === undefined ? {} : { devServerUrl }),
      }),
      logger,
    },
    {
      'app:getState': () => Promise.resolve(state.get()),
      'events:list': async () => {
        await eventsLoaded
        return eventsStore.listForDisplay(settingsStore.current().eventDays, now())
      },
      // PR の一覧は S5 で足す
      'prs:get': () => Promise.resolve(null),
    },
  )

  applyApplicationMenu({ packaged: app.isPackaged, platform: process.platform })
  mainWindow = createMainWindow(devServerUrl === undefined ? {} : { devServerUrl })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 24時間ごとに、発生から30日を過ぎた出来事を消す（I-4、component-backend.md 7.）
  setInterval(() => {
    eventsStore
      .purge(now())
      .then((changed) => {
        if (changed)
          pusher.send(
            'events:reset',
            eventsStore.listForDisplay(settingsStore.current().eventDays, now()),
          )
      })
      .catch((error: unknown) => logger.error('store.purge_failed', { error: errorName(error) }))
  }, DAY_MS)
}

// 二重に立ち上げない。2つめは、すでに開いている窓を前に出して終わる（component-backend.md 8.）
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  // 窓を閉じたら終了する（F-24）
  app.on('window-all-closed', () => {
    app.quit()
  })
  app
    .whenReady()
    .then(start)
    .catch(() => {
      // 立ち上げに失敗したら終わる（ログの仕組みを作る前の失敗もありうるため、ここでは書かない）
      app.exit(1)
    })
}
