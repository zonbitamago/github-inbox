// 組み立てと立ち上げの順番（component-backend.md 5.1）。S1 は保存・ログ・窓・IPC の受け口、S2 は認証、S3 は取り込み、
// S4 はデスクトップ通知、S5 は PR の一覧。
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, ipcMain, powerMonitor, safeStorage, type BrowserWindow } from 'electron'
import { DAY_MS } from './core/constants'
import { AppStateHolder } from './app/app-state'
import { createDesktopNotificationSettingsOpener, createGitHubOpener } from './app/external'
import { applyApplicationMenu, createMainWindow } from './app/window'
import { AuthService } from './auth/auth-service'
import { TokenStore } from './auth/token-store'
import { createGitHubClient } from './github/client'
import { RateBudget } from './github/rate-budget'
import { fetchViewer } from './github/viewer'
import { IngestService } from './ingest/ingest-service'
import type { Timer } from './ingest/scheduler'
import { createPusher, createSenderCheck, registerInvokeHandlers } from './ipc/handlers'
import { createLogger } from './log/logger'
import {
  createElectronDesktopNotification,
  isDesktopNotificationSupported,
} from './notify/electron-desktop-notification'
import { DesktopNotifier } from './notify/notifier'
import { PrListService } from './pr-list/pr-list-service'
import { EventsStore } from './store/events-store'
import { SettingsStore } from './store/settings-store'

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

let mainWindow: BrowserWindow | null = null

/** 窓を前に出す（最小化していれば戻す）。2つめの立ち上げと、デスクトップ通知のクリック（F-08）で使う */
function bringMainWindowToFront(): void {
  if (mainWindow === null) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  // Mac では、他のアプリが前にあっても本アプリを前に出す（利用者がクリックしたときだけ呼ぶ）
  if (process.platform === 'darwin') app.focus({ steal: true })
}

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
  const version = app.getVersion()
  // 認証の状態は、窓を開く前に auth.prepare で決める（下）
  const state = new AppStateHolder(
    {
      version,
      platform,
      inApplicationsFolder: platform === 'darwin' ? app.isInApplicationsFolder() : null,
      settings,
      loginItemEnabled: app.getLoginItemSettings().openAtLogin,
      auth: { status: 'signed_out' },
      ingest: { state: 'signed_out' },
      desktopNotification: {},
      prList: { loading: false },
    },
    (next) => pusher.send('state:changed', next),
  )

  // GitHub への問い合わせ（component-backend.md 6.）。トークンは問い合わせのたびに関数で渡す（I-7）
  const rateBudget = new RateBudget()
  const githubClientFor = (getToken: () => string | undefined) =>
    createGitHubClient({
      getToken,
      rateBudget,
      logger,
      userAgent: `github-inbox/${version}`,
      now,
    })

  // デスクトップ通知（component-backend.md 5.4）。クリックされたら窓を前に出し、画面にその出来事を知らせる（F-08）
  const notifier = new DesktopNotifier({
    isSupported: isDesktopNotificationSupported,
    create: createElectronDesktopNotification,
    settings: () => settingsStore.current(),
    outsideApplicationsFolder: () => platform === 'darwin' && !app.isInApplicationsFolder(),
    now,
    logger,
    publishFailure: (view) => state.update({ desktopNotification: view }),
    focusEvent: (eventId) => {
      bringMainWindowToFront()
      pusher.send('ui:focusEvent', { eventId })
    },
  })

  const timer: Timer = {
    schedule: (callback, delayMs) => {
      const handle = setTimeout(callback, delayMs)
      return () => clearTimeout(handle)
    },
  }

  // 取り込み（component-backend.md 5.2）。トークンは問い合わせのたびに認証から受け取る（I-7）
  const ingest = new IngestService({
    client: githubClientFor(() => auth.token()),
    store: eventsStore,
    storeLoaded: eventsLoaded,
    eventDays: () => settingsStore.current().eventDays,
    rateBudget,
    timer,
    now,
    logger,
    publish: (view) => state.update({ ingest: view }),
    // 定期の取り込みで増えた出来事は、画面に足し、デスクトップ通知を出すかを決める（取り戻しの出来事は届かない。DN-1）
    added: (events) => {
      pusher.send('events:added', events)
      notifier.notifyLive(events)
    },
    reset: (events) => pusher.send('events:reset', events),
    // 401 を受けたら、認証が切れた状態にする（auth-flow.md 5.）
    authFailed: () => auth.expire(),
  })

  // PR の一覧（component-backend.md 5.3）。サインインしたとき（立ち上げを含む）とリロードで取る（F-20）
  const prList = new PrListService({
    client: githubClientFor(() => auth.token()),
    periodDays: () => settingsStore.current().prPeriodDays,
    now,
    logger,
    publish: (view) => state.update({ prList: view }),
    updated: (snapshot) => pusher.send('prs:updated', snapshot),
    authFailed: () => auth.expire(),
  })
  const startPrList = (login: string) => {
    prList
      .start(login)
      .catch((error: unknown) => logger.error('pr_list.unexpected', { error: errorName(error) }))
  }

  // 認証（auth-flow.md）
  const tokenStore = new TokenStore(
    join(userData, 'token.bin'),
    {
      isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
      encrypt: (text) => safeStorage.encryptStringAsync(text),
      decrypt: async (data) => {
        const decrypted = await safeStorage.decryptStringAsync(data)
        return { text: decrypted.result, shouldReEncrypt: decrypted.shouldReEncrypt }
      },
    },
    logger,
  )
  const auth = new AuthService({
    tokenStore,
    fetchViewer: (token) => fetchViewer(githubClientFor(() => token)),
    version,
    platform,
    lastLaunchedVersion: () => settingsStore.current().lastLaunchedVersion,
    saveLastLaunchedVersion: async (launched) => {
      const saved = await settingsStore.update({ lastLaunchedVersion: launched })
      state.update({ settings: saved })
    },
    // 前のアカウントの出来事と PR の一覧を残さない（auth-flow.md 6.）
    clearEvents: async () => {
      await eventsStore.clear()
      pusher.send('events:reset', [])
      prList.clear()
    },
    publish: (view) => state.update({ auth: view.auth, ingest: view.ingest }),
    // 取り戻しと PR の一覧を同時に始める（component-backend.md 5.1）
    onSignedIn: (login) => {
      ingest.start(login)
      startPrList(login)
    },
    onSignedOut: () => {
      ingest.stop()
      prList.stop()
    },
    timer,
    now,
    logger,
  })
  // キーチェーンに触れずに決められる状態（トークンがあるか・キーチェーンの案内が要るか）。窓はまだ無いので知らせは届かない
  state.update(await auth.prepare())
  const openGitHub = createGitHubOpener()

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
      'prs:get': () => Promise.resolve(prList.current()),
      'prs:reload': () => prList.reload(),
      'auth:submitPat': ({ token }) => auth.submitPat(token),
      'auth:continueAfterKeychainNotice': () => auth.continueAfterKeychainNotice(),
      'auth:signOut': () => auth.signOut(),
      'shell:openGitHub': ({ url }) => openGitHub(url),
      'os:openNotificationSettings': createDesktopNotificationSettingsOpener(platform),
      // 使い始めの案内を終える（component-frontend.md 3. の手順5）。サインインしてからでないと終えられない
      'onboarding:complete': async () => {
        if (state.get().auth.status !== 'signed_in') {
          return { ok: false, error: { code: 'not_signed_in' } } as const
        }
        const saved = await settingsStore.update({
          onboarding: { completedAt: now().toISOString() },
        })
        state.update({ settings: saved })
        return { ok: true, value: undefined }
      },
    },
  )

  applyApplicationMenu({ packaged: app.isPackaged, platform: process.platform })
  mainWindow = createMainWindow(devServerUrl === undefined ? {} : { devServerUrl })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // トークンを読み出して GET /user で確かめる（版が変わったときは、画面の「続ける」を待つ）。確かめられたら取り込みを始める
  auth.resume()
  // スリープから戻ったら、すぐ1回問い合わせる（component-backend.md 6.1）
  powerMonitor.on('resume', () => ingest.wake())

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
    bringMainWindowToFront()
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
