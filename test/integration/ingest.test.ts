// 結合M: 取り込み（build-plan.md S3、component-backend.md 5.1・5.2・6.、test-conventions.md 4.2）。
// GitHub は MSW で受け、登録していない問い合わせはエラーにする。本物の client・rate-budget・auth・ingest・events-store を組む
// （組み立ては src/main/index.ts と同じ）。時計は固定し、予約は偽物で1つずつ動かす。
// 記録した分解の応答の日時（2026-01）に合わせ、今を 2026-01-31、出来事の一覧の日数を30日にする。
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService, type AuthView } from '../../src/main/auth/auth-service'
import { TokenStore } from '../../src/main/auth/token-store'
import { createGitHubClient } from '../../src/main/github/client'
import { RateBudget } from '../../src/main/github/rate-budget'
import { fetchViewer } from '../../src/main/github/viewer'
import { IngestService } from '../../src/main/ingest/ingest-service'
import { EventsStore } from '../../src/main/store/events-store'
import type { GitHubEvent } from '../../src/shared/domain'
import type { AppState } from '../../src/shared/ipc-contract'
import notModified from '../fixtures/github/notifications-not-modified.json'
import recordedTeams from '../fixtures/github/user-teams.json'
import recordedUser from '../fixtures/github/user.json'
import { createFakeSecretCipher } from '../support/fake-secret-cipher'
import { createFakeTimer } from '../support/fake-timer'
import {
  recordedExpandResponse,
  recordedExpandedGitHubNotifications,
  recordedGitHubNotificationHeaders,
} from '../support/github-fixtures'
import { createMemoryLogger } from '../support/memory-logger'

const TOKEN = 'test-token-not-real'
const NOW = new Date('2026-01-31T00:00:00Z')
const EVENT_DAYS = 30
const API = 'https://api.github.com'
const HEADERS = recordedGitHubNotificationHeaders()
const GRAPHQL_HEADERS = {
  'x-ratelimit-resource': 'graphql',
  'x-ratelimit-remaining': '4972',
  'x-ratelimit-reset': '1769821269',
}

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-ingest-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

interface Received {
  method: string
  path: string
  authorization: string | null
  ifNoneMatch: string | null
  query?: string
}

/** 模擬の GitHub。受けた問い合わせを覚える。notifications は差し替えられる（ネットワークを切るなど） */
function serveGitHub(
  options: {
    user?: () => Response
    githubNotifications?: (request: Request) => Response | undefined
  } = {},
) {
  const received: Received[] = []
  const remember = (request: Request, query?: string) => {
    const url = new URL(request.url)
    received.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.get('authorization'),
      ifNoneMatch: request.headers.get('if-none-match'),
      ...(query === undefined ? {} : { query }),
    })
  }
  server.use(
    http.get(`${API}/user`, ({ request }) => {
      remember(request)
      return (
        options.user?.() ??
        HttpResponse.json(recordedUser.response.body, { headers: recordedUser.response.headers })
      )
    }),
    http.get(`${API}/user/teams`, ({ request }) => {
      remember(request)
      return HttpResponse.json(recordedTeams.response.body)
    }),
    http.get(`${API}/notifications`, ({ request }) => {
      remember(request)
      const answered = options.githubNotifications?.(request)
      if (answered !== undefined) return answered
      // 前回の ETag なら 304（CR-003。記録した応答）
      if (request.headers.get('if-none-match') === HEADERS['etag']) {
        return new HttpResponse(null, { status: 304, headers: notModified.response.headers })
      }
      return HttpResponse.json(recordedExpandedGitHubNotifications(), { headers: HEADERS })
    }),
    http.post(`${API}/graphql`, async ({ request }) => {
      const body = (await request.clone().json()) as {
        query: string
        variables: Record<string, unknown>
      }
      remember(request, body.query)
      return HttpResponse.json(recordedExpandResponse(body.variables), {
        headers: GRAPHQL_HEADERS,
      })
    }),
  )
  return received
}

/** 本物の部品を組む（src/main/index.ts と同じつなぎ方）。立ち上げ直しは、同じフォルダで launch し直す */
function launch() {
  const logger = createMemoryLogger()
  const timer = createFakeTimer()
  const rateBudget = new RateBudget()
  const now = () => NOW
  const client = (getToken: () => string | undefined) =>
    createGitHubClient({ getToken, rateBudget, logger, userAgent: 'github-inbox/1.2.0', now })
  const eventsStore = new EventsStore(join(dir, 'events.json'), logger)
  const storeLoaded = eventsStore.load(NOW)
  const state: { auth?: AppState['auth']; ingest?: AppState['ingest'] } = {}
  const added: GitHubEvent[][] = []
  const resets: GitHubEvent[][] = []
  const published: AuthView[] = []

  const ingest: IngestService = new IngestService({
    client: client(() => auth.token()),
    store: eventsStore,
    storeLoaded,
    eventDays: () => EVENT_DAYS,
    rateBudget,
    timer,
    now,
    logger,
    publish: (view) => {
      state.ingest = view
    },
    added: (events) => added.push(events),
    reset: (events) => resets.push(events),
    authFailed: () => auth.expire(),
  })
  const auth: AuthService = new AuthService({
    tokenStore: new TokenStore(join(dir, 'token.bin'), createFakeSecretCipher(), logger),
    fetchViewer: (token) => fetchViewer(client(() => token)),
    version: '1.2.0',
    platform: 'darwin',
    lastLaunchedVersion: () => '1.2.0',
    saveLastLaunchedVersion: () => Promise.resolve(),
    clearEvents: () => eventsStore.clear(),
    publish: (view) => {
      published.push(view)
      state.auth = view.auth
      state.ingest = view.ingest
    },
    onSignedIn: (login) => ingest.start(login),
    onSignedOut: () => ingest.stop(),
    timer,
    now,
    logger,
  })
  /** 次の予約が入るまで（1回分が終わるまで）待つ */
  const cycleDone = () => vi.waitFor(() => expect(timer.pending()).toBe(1))
  return { auth, ingest, eventsStore, timer, logger, state, added, resets, published, cycleDone }
}

async function readEventsFile(): Promise<{
  events: GitHubEvent[]
  githubNotifications: { etag?: string; lastSuccessAt?: string }
  threads: Record<string, { expandedUntil: string; consecutiveFailures: number }>
}> {
  return JSON.parse(await readFile(join(dir, 'events.json'), 'utf-8')) as never
}

/** PAT を貼ってサインインした状態から始める */
async function signedIn() {
  const app = launch()
  await app.auth.prepare()
  await app.auth.submitPat(TOKEN)
  await app.cycleDone()
  return app
}

describe('サインインから取り戻しまで（component-backend.md 5.1、F-06）', () => {
  it('PAT でサインインしたら取り戻しを始め、出来事と取り込みの記録を events.json に保存する（I-5）', async () => {
    const received = serveGitHub()
    const app = await signedIn()

    const file = await readEventsFile()
    expect(file.events.length).toBeGreaterThan(0)
    expect(file.githubNotifications).toEqual({
      etag: HEADERS['etag'],
      lastSuccessAt: NOW.toISOString(),
    })
    expect(Object.keys(file.threads)).toHaveLength(6)
    expect(app.state).toEqual({
      auth: { status: 'signed_in', login: 'alice', method: 'pat' },
      ingest: { state: 'ok', lastSuccessAt: NOW.toISOString() },
    })
    expect(app.resets).toEqual([app.eventsStore.listForDisplay(EVENT_DAYS, NOW)])
    // 問い合わせはどれもトークンを付け、書き込みをしない（N-06）
    expect(received.every((request) => request.authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(
      received.every(
        (request) =>
          request.method === 'GET' || (request.method === 'POST' && request.path === '/graphql'),
      ),
    ).toBe(true)
    expect(received.some((request) => /\bmutation\b/.test(request.query ?? ''))).toBe(false)
  })

  it('取り戻しの問い合わせの回数が目安の内に収まる（Q-04、github-api.md 7.）', async () => {
    const received = serveGitHub()
    await signedIn()
    // GET /user・GET /user/teams・GET /notifications と、まとめた分解1回
    expect(received.map((request) => `${request.method} ${request.path.split('?')[0]}`)).toEqual([
      'GET /user',
      'GET /user/teams',
      'GET /notifications',
      'POST /graphql',
    ])
  })

  it('トークンを events.json とログに書かない（I-7）', async () => {
    serveGitHub()
    const app = await signedIn()
    for (const name of await readdir(dir)) {
      if (name === 'token.bin') continue
      expect(await readFile(join(dir, name), 'utf-8')).not.toContain(TOKEN)
    }
    expect(JSON.stringify(app.logger.entries)).not.toContain(TOKEN)
  })
})

describe('立ち上げ直し（component-backend.md 5.1、CR-003）', () => {
  it('保存した ETag を If-None-Match に付け、304 なら保存済みの出来事のまま一覧を送る', async () => {
    serveGitHub()
    const first = await signedIn()
    const saved = first.eventsStore.listForDisplay(EVENT_DAYS, NOW)
    first.ingest.stop()

    const received = serveGitHub()
    const second = launch()
    await second.auth.prepare()
    second.auth.resume()
    await second.cycleDone()

    const githubNotifications = received.filter((request) =>
      request.path.startsWith('/notifications'),
    )
    expect(githubNotifications.map((request) => request.ifNoneMatch)).toEqual([HEADERS['etag']])
    // since は「前回の成功の時刻 − 5分」
    expect(new URL(githubNotifications[0]?.path ?? '', API).searchParams.get('since')).toBe(
      '2026-01-30T23:55:00Z',
    )
    expect(received.some((request) => request.method === 'POST')).toBe(false)
    expect(second.resets).toEqual([saved])
    expect(second.state.ingest).toEqual({ state: 'ok', lastSuccessAt: NOW.toISOString() })
  })
})

describe('受け取れないとき（N-07・N-08、AC-13・AC-14）', () => {
  it('ネットワークが切れたら2回目で offline にし、つながったら取り込んで ok に戻る', async () => {
    const network = { down: true }
    serveGitHub({
      githubNotifications: () => (network.down ? HttpResponse.error() : undefined),
    })
    const app = launch()
    await app.auth.prepare()
    await app.auth.submitPat(TOKEN)
    await app.cycleDone()
    expect(app.state.ingest).toEqual({ state: 'syncing' })

    expect(app.timer.runNext()).toBe(60_000)
    await app.cycleDone()
    expect(app.state.ingest).toEqual({ state: 'offline' })

    network.down = false
    app.timer.runNext()
    await app.cycleDone()
    expect(app.state.ingest).toEqual({ state: 'ok', lastSuccessAt: NOW.toISOString() })
    expect((await readEventsFile()).events.length).toBeGreaterThan(0)
  })

  it('取り込みで 401 を受けたら、認証が切れた状態にして止める。保存済みの出来事は残す（auth-flow.md 5.）', async () => {
    serveGitHub()
    const app = await signedIn()
    const saved = (await readEventsFile()).events

    serveGitHub({
      githubNotifications: () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
    })
    app.timer.runNext()
    await vi.waitFor(() =>
      expect(app.state).toEqual({
        auth: { status: 'auth_failed', login: 'alice', method: 'pat' },
        ingest: { state: 'auth_failed' },
      }),
    )
    expect(app.timer.pending()).toBe(0)
    expect((await readEventsFile()).events).toEqual(saved)
  })

  it('サインアウトしたら取り込みを止め、events.json を消す（auth-flow.md 6.）', async () => {
    const received = serveGitHub()
    const app = await signedIn()
    await app.auth.signOut()
    expect(app.timer.pending()).toBe(0)
    await expect(readFile(join(dir, 'events.json'))).rejects.toThrow()
    const count = received.length
    app.ingest.wake()
    expect(received).toHaveLength(count)
  })
})
