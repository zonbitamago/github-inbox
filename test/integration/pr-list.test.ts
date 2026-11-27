// 結合M: PR の一覧（build-plan.md S5、component-backend.md 5.3、github-api.md 5.、test-conventions.md 4.2）。
// GitHub は MSW で受け、登録していない問い合わせはエラーにする。本物の client・rate-budget・auth・pr-list を組む
// （組み立ては src/main/index.ts と同じ。取り込みはこのテストでは組まない）。時計は固定する。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthService } from '../../src/main/auth/auth-service'
import { TokenStore } from '../../src/main/auth/token-store'
import { createGitHubClient } from '../../src/main/github/client'
import { RateBudget } from '../../src/main/github/rate-budget'
import { fetchViewer } from '../../src/main/github/viewer'
import { PrListService } from '../../src/main/pr-list/pr-list-service'
import {
  PrListSnapshotSchema,
  type AppState,
  type PrListSnapshot,
} from '../../src/shared/ipc-contract'
import searchA from '../fixtures/github/graphql-search-a-involves.json'
import searchB from '../fixtures/github/graphql-search-b-review-requested.json'
import searchC from '../fixtures/github/graphql-search-c-own-open.json'
import recordedUser from '../fixtures/github/user.json'
import { createFakeSecretCipher } from '../support/fake-secret-cipher'
import { createFakeTimer } from '../support/fake-timer'
import { createMemoryLogger } from '../support/memory-logger'

const TOKEN = 'test-token-not-real'
const NOW = new Date('2026-01-31T00:00:00Z')
const API = 'https://api.github.com'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-pr-list-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** 検索語の先頭で、どの検索かを見分ける */
function recordedSearch(q: string) {
  if (q.startsWith('is:pr involves:@me ')) return searchA
  if (q.startsWith('is:pr review-requested:@me ')) return searchB
  if (q.startsWith('is:pr is:open author:@me ')) return searchC
  return undefined
}

interface ReceivedSearch {
  q: string
  authorization: string | null
}

/**
 * 模擬の GitHub。検索は、3本が揃うまで応答を待たせる（同時に投げていることを確かめる）。
 * search で応答を差し替えられる
 */
function serveGitHub(options: { search?: (q: string) => Response | undefined } = {}) {
  const received: ReceivedSearch[] = []
  let arrived = 0
  let releaseAll: () => void = () => undefined
  const allArrived = new Promise<void>((resolve) => {
    releaseAll = resolve
  })
  server.use(
    http.get(`${API}/user`, () =>
      HttpResponse.json(recordedUser.response.body, { headers: recordedUser.response.headers }),
    ),
    http.post(`${API}/graphql`, async ({ request }) => {
      const body = (await request.clone().json()) as { variables: { q: string } }
      const { q } = body.variables
      received.push({ q, authorization: request.headers.get('authorization') })
      arrived += 1
      if (arrived % 3 === 0) releaseAll()
      await allArrived
      const answered = options.search?.(q)
      if (answered !== undefined) return answered
      const recorded = recordedSearch(q)
      if (recorded === undefined)
        return HttpResponse.json({ message: 'unexpected' }, { status: 500 })
      return HttpResponse.json(recorded.response.body, { headers: recorded.response.headers })
    }),
  )
  return received
}

/** 本物の部品を組む（src/main/index.ts と同じつなぎ方） */
function launch() {
  const logger = createMemoryLogger()
  const timer = createFakeTimer()
  const rateBudget = new RateBudget()
  const now = () => NOW
  const client = (getToken: () => string | undefined) =>
    createGitHubClient({ getToken, rateBudget, logger, userAgent: 'github-inbox/1.2.0', now })
  const state: { prList: AppState['prList'][]; auth?: AppState['auth'] } = { prList: [] }
  const snapshots: PrListSnapshot[] = []
  const prList: PrListService = new PrListService({
    client: client(() => auth.token()),
    periodDays: () => 7,
    now,
    logger,
    publish: (view) => state.prList.push(view),
    updated: (snapshot) => snapshots.push(snapshot),
    authFailed: () => auth.expire(),
  })
  let started: Promise<unknown> = Promise.resolve()
  const auth: AuthService = new AuthService({
    tokenStore: new TokenStore(join(dir, 'token.bin'), createFakeSecretCipher(), logger),
    fetchViewer: (token) => fetchViewer(client(() => token)),
    version: '1.2.0',
    platform: 'darwin',
    lastLaunchedVersion: () => '1.2.0',
    saveLastLaunchedVersion: () => Promise.resolve(),
    clearEvents: () => {
      prList.clear()
      return Promise.resolve()
    },
    publish: (view) => {
      state.auth = view.auth
    },
    onSignedIn: (login) => {
      started = prList.start(login)
    },
    onSignedOut: () => prList.stop(),
    timer,
    now,
    logger,
  })
  /** サインインで始めた取得が終わるまで待つ */
  const firstFetch = () => started
  return { auth, prList, logger, state, snapshots, firstFetch }
}

async function signedIn() {
  const app = launch()
  await app.auth.prepare()
  await app.auth.submitPat(TOKEN)
  await app.firstFetch()
  return app
}

describe('サインインしたら PR の一覧を取る（component-backend.md 5.1・5.3、F-15・F-20）', () => {
  it('検索3本を同時に投げ、まとめた一覧を契約の形で画面に送る', async () => {
    const received = serveGitHub()
    const app = await signedIn()

    expect(received.map((search) => search.q).toSorted()).toEqual([
      'is:pr involves:@me updated:>2026-01-24T00:00:00Z',
      'is:pr is:open author:@me updated:>2026-01-24T00:00:00Z',
      'is:pr review-requested:@me updated:>2026-01-24T00:00:00Z',
    ])
    expect(received.every((search) => search.authorization === `Bearer ${TOKEN}`)).toBe(true)
    const [snapshot] = app.snapshots
    expect(PrListSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(snapshot?.items).toHaveLength(48)
    expect(app.prList.current()).toEqual(snapshot)
    // PAT の貼り付けでは、サインインの前に止める（stop）ため、最初に取得していない状態が届く
    expect(app.state.prList).toEqual([{ loading: false }, { loading: true }, { loading: false }])
  })

  it('記録した応答の自分待ちの理由（AC-17）: レビュー依頼・承認・アサインが付く', async () => {
    serveGitHub()
    const app = await signedIn()
    const reasons = new Set(app.snapshots[0]?.items.flatMap((item) => item.waitingReasons))

    expect(reasons).toEqual(new Set(['review_pending', 'approved', 'assigned']))
  })

  it('リロードで取り直す。取得中の2回目は新しく投げない', async () => {
    const received = serveGitHub()
    const app = await signedIn()
    const [first, second] = await Promise.all([app.prList.reload(), app.prList.reload()])

    expect(received).toHaveLength(6)
    expect(first).toEqual(second)
    expect(app.snapshots).toHaveLength(2)
  })

  it('サインアウトしたら、前のアカウントの一覧を消す（auth-flow.md 6.）', async () => {
    serveGitHub()
    const app = await signedIn()
    await app.auth.signOut()

    expect(app.prList.current()).toBeNull()
    await expect(app.prList.reload()).resolves.toEqual({
      ok: false,
      error: { code: 'not_signed_in' },
    })
  })
})

describe('失敗（component-backend.md 6.3、ipc-contract.md 4.）', () => {
  it.each([
    ['つながらない', () => HttpResponse.error(), 'offline'],
    ['GitHub の障害（502）', () => HttpResponse.json({}, { status: 502 }), 'github_error'],
    [
      '利用制限（403 と残り0）',
      () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1769821269' },
          },
        ),
      'rate_limited',
    ],
  ])('検索 C が %s なら、%s を画面に出し、前の一覧は残す', async (_name, respond, code) => {
    let failing = false
    serveGitHub({
      search: (q) => (failing && q.startsWith('is:pr is:open') ? respond() : undefined),
    })
    const app = await signedIn()
    failing = true
    const result = await app.prList.reload()

    expect(result).toEqual({ ok: false, error: { code } })
    expect(app.state.prList.at(-1)).toEqual({ loading: false, error: code })
    expect(app.prList.current()).toEqual(app.snapshots[0])
  })

  it('401 なら認証が切れた状態にし（auth-flow.md 5.）、リロードは止める', async () => {
    let failing = false
    serveGitHub({
      search: () =>
        failing ? HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }) : undefined,
    })
    const app = await signedIn()
    failing = true
    const result = await app.prList.reload()

    expect(result).toEqual({ ok: false, error: { code: 'auth_failed' } })
    expect(app.state.auth?.status).toBe('auth_failed')
    // 一覧は残す（保存済みの出来事と同じ）
    expect(app.prList.current()).toEqual(app.snapshots[0])
  })
})
