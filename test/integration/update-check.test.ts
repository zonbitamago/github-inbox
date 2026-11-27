// 結合M: 新しい版の確認（build-plan.md S6、F-31、component-backend.md 5.1、github-api.md 6.、test-conventions.md 4.2）。
// GitHub は MSW で受け、登録していない問い合わせはエラーにする。本物の client・rate-budget・auth・update-check・app-state を組む
// （組み立ては src/main/index.ts と同じ。取り込みと PR の一覧はこのテストでは組まない）。時計は固定する。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppStateHolder } from '../../src/main/app/app-state'
import { UpdateChecker } from '../../src/main/app/update-check'
import { AuthService } from '../../src/main/auth/auth-service'
import { TokenStore } from '../../src/main/auth/token-store'
import { DAY_MS } from '../../src/main/core/constants'
import { createGitHubClient } from '../../src/main/github/client'
import { RateBudget } from '../../src/main/github/rate-budget'
import { fetchLatestRelease } from '../../src/main/github/releases'
import { fetchViewer } from '../../src/main/github/viewer'
import { DEFAULT_SETTINGS } from '../../src/shared/domain'
import { AppStateSchema } from '../../src/shared/ipc-contract'
import recordedNone from '../fixtures/github/rest-releases-latest-none.json'
import recordedUser from '../fixtures/github/user.json'
import { createFakeSecretCipher } from '../support/fake-secret-cipher'
import { createFakeTimer } from '../support/fake-timer'
import { createMemoryLogger } from '../support/memory-logger'

const TOKEN = 'test-token-not-real'
const NOW = new Date('2026-01-31T00:00:00Z')
const API = 'https://api.github.com'
const RELEASES_LATEST = `${API}/repos/zonbitamago/github-inbox/releases/latest`

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-update-check-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * 書き換えた応答: 版のある 200 の応答はまだ記録していない（配布用のリポジトリに版が無い。S7 で最初の版を出したら記録する。
 * test/fixtures/github/README.md の「まだ無い場面」）。記録した 404 のヘッダー（利用制限）を使い、本文は github-api.md 6. で使う項目だけ
 */
function releaseResponse(tagName: string) {
  return HttpResponse.json(
    {
      tag_name: tagName,
      html_url: `https://github.com/zonbitamago/github-inbox/releases/tag/${tagName}`,
    },
    { headers: recordedNone.response.headers },
  )
}

/** 模擬の GitHub。releases は問い合わせごとに応答を決める */
function serveGitHub(releases: (() => Response)[]) {
  const received: { authorization: string | null }[] = []
  server.use(
    http.get(`${API}/user`, () =>
      HttpResponse.json(recordedUser.response.body, { headers: recordedUser.response.headers }),
    ),
    http.get(RELEASES_LATEST, ({ request }) => {
      received.push({ authorization: request.headers.get('authorization') })
      const answer = releases.shift()
      if (answer === undefined) return HttpResponse.json({ message: 'unexpected' }, { status: 500 })
      return answer()
    }),
  )
  return received
}

/** 本物の部品を組む（src/main/index.ts と同じつなぎ方） */
function launch(currentVersion = '1.2.0') {
  const logger = createMemoryLogger()
  const authTimer = createFakeTimer()
  const updateTimer = createFakeTimer()
  const rateBudget = new RateBudget()
  const now = () => NOW
  const client = (getToken: () => string | undefined) =>
    createGitHubClient({
      getToken,
      rateBudget,
      logger,
      userAgent: `github-inbox/${currentVersion}`,
      now,
    })
  const state = new AppStateHolder(
    {
      version: currentVersion,
      platform: 'darwin',
      inApplicationsFolder: true,
      settings: { ...DEFAULT_SETTINGS, onboarding: { completedAt: NOW.toISOString() } },
      loginItemEnabled: false,
      auth: { status: 'signed_out' },
      ingest: { state: 'signed_out' },
      desktopNotification: {},
      prList: { loading: false },
    },
    () => undefined,
  )
  const releasesClient = client(() => auth.token())
  const updateChecker = new UpdateChecker({
    fetchLatest: () => fetchLatestRelease(releasesClient),
    currentVersion,
    schedule: (callback, delayMs) => updateTimer.schedule(callback, delayMs),
    logger,
    publish: (update) => state.update({ update }),
  })
  let checked: Promise<void> = Promise.resolve()
  const auth: AuthService = new AuthService({
    tokenStore: new TokenStore(join(dir, 'token.bin'), createFakeSecretCipher(), logger),
    fetchViewer: (token) => fetchViewer(client(() => token)),
    version: currentVersion,
    platform: 'darwin',
    lastLaunchedVersion: () => currentVersion,
    saveLastLaunchedVersion: () => Promise.resolve(),
    clearEvents: () => Promise.resolve(),
    publish: (view) => state.update({ auth: view.auth, ingest: view.ingest }),
    onSignedIn: () => {
      checked = updateChecker.start()
    },
    onSignedOut: () => updateChecker.stop(),
    timer: authTimer,
    now,
    logger,
  })
  /** サインインで始めた確認が終わるまで待つ */
  const firstCheck = () => checked
  return { auth, state, logger, updateTimer, firstCheck }
}

async function signedIn(currentVersion?: string) {
  const app = launch(currentVersion)
  await app.auth.prepare()
  await app.auth.submitPat(TOKEN)
  await app.firstCheck()
  return app
}

// F-31、AC-31
describe('新しい版の確認（github-api.md 6.）', () => {
  it('サインインしたら確かめ、新しい版があれば版と Releases のページを契約の形で画面に渡す', async () => {
    const received = serveGitHub([() => releaseResponse('v1.3.0')])
    const app = await signedIn()

    expect(received).toEqual([{ authorization: `Bearer ${TOKEN}` }])
    const state = app.state.get()
    expect(AppStateSchema.parse(state)).toEqual(state)
    expect(state.update).toEqual({
      version: '1.3.0',
      url: 'https://github.com/zonbitamago/github-inbox/releases/tag/v1.3.0',
    })
  })

  it('今と同じ版なら知らせない', async () => {
    serveGitHub([() => releaseResponse('v1.2.0')])
    const app = await signedIn()
    expect(app.state.get().update).toBeUndefined()
  })

  it('版がまだ1つも無い（記録した 404）なら知らせず、認証は切らない', async () => {
    serveGitHub([
      () =>
        HttpResponse.json(recordedNone.response.body, {
          status: recordedNone.response.status,
          headers: recordedNone.response.headers,
        }),
    ])
    const app = await signedIn()
    expect(app.state.get().update).toBeUndefined()
    expect(app.state.get().auth.status).toBe('signed_in')
  })

  it('サインインしていなければ確かめない', async () => {
    const received = serveGitHub([])
    const app = launch()
    await app.auth.prepare()
    await app.firstCheck()
    expect(received).toEqual([])
    expect(app.updateTimer.pending()).toBe(0)
  })

  it('つながらなければ知らせを変えず、24時間後に確かめ直す', async () => {
    serveGitHub([() => HttpResponse.error(), () => releaseResponse('v1.3.0')])
    const app = await signedIn()
    expect(app.state.get().update).toBeUndefined()
    expect(app.logger.entries).toContainEqual({
      level: 'warn',
      kind: 'update_check.failed',
      fields: { failure: 'offline' },
    })

    expect(app.updateTimer.runNext()).toBe(DAY_MS)
    await expect.poll(() => app.state.get().update?.version).toBe('1.3.0')
  })

  it('サインアウトしたら次の確認を取り消す。知らせた新しい版は残す', async () => {
    serveGitHub([() => releaseResponse('v1.3.0')])
    const app = await signedIn()
    await app.auth.signOut()

    expect(app.updateTimer.pending()).toBe(0)
    expect(app.state.get().update?.version).toBe('1.3.0')
  })
})
