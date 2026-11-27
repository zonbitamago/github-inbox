// 結合M: PAT の確かめの各応答（build-plan.md S2、auth-flow.md 3.・4.・6.）。
// GitHub は MSW で受け、登録していない問い合わせはエラーにする（test-conventions.md 4.2）。
// 本物の client・viewer・pat・auth-service・token-store を組み、トークンのファイルはテストごとの一時フォルダに書く。
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
import recordedUser from '../fixtures/github/user.json'
import { createFakeSecretCipher } from '../support/fake-secret-cipher'
import { createMemoryLogger } from '../support/memory-logger'

const TOKEN = 'test-token-not-real'
const USER_URL = 'https://api.github.com/user'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-auth-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** 記録した GET /user の応答。ヘッダーを書き換えるときは、テストの名前に「書き換えた応答」と書く */
function recordedUserResponse(headers: Record<string, string | null> = {}) {
  const merged: Record<string, string | null> = { ...recordedUser.response.headers, ...headers }
  const kept = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== null,
  )
  return HttpResponse.json(recordedUser.response.body, { headers: Object.fromEntries(kept) })
}

/** 受けた問い合わせの Authorization を覚える */
function serveUser(respond: () => Response) {
  const authorizations: (string | null)[] = []
  server.use(
    http.get(USER_URL, ({ request }) => {
      authorizations.push(request.headers.get('authorization'))
      return respond()
    }),
  )
  return authorizations
}

/** 本物の部品を組む。設定（lastLaunchedVersion）は立ち上げ直しをまたいで使う */
function launch(settings: { lastLaunchedVersion?: string } = {}) {
  const logger = createMemoryLogger()
  const rateBudget = new RateBudget()
  const published: AuthView[] = []
  const service = new AuthService({
    tokenStore: new TokenStore(join(dir, 'token.bin'), createFakeSecretCipher(), logger),
    fetchViewer: (token) =>
      fetchViewer(
        createGitHubClient({
          getToken: () => token,
          rateBudget,
          logger,
          userAgent: 'github-inbox/1.2.0',
          now: () => new Date(),
        }),
      ),
    version: '1.2.0',
    platform: 'darwin',
    lastLaunchedVersion: () => settings.lastLaunchedVersion,
    saveLastLaunchedVersion: (version) => {
      settings.lastLaunchedVersion = version
      return Promise.resolve()
    },
    clearEvents: () => Promise.resolve(),
    publish: (view) => published.push(view),
    // 取り込みへの引き継ぎは test/integration/ingest.test.ts で確かめる
    onSignedIn: () => undefined,
    onSignedOut: () => undefined,
    timer: { schedule: () => () => undefined },
    now: () => new Date(),
    logger,
  })
  return { service, published, logger, settings }
}

describe('PAT を貼ってサインインする（auth-flow.md 3.）', () => {
  it('記録した応答（repo を含む）なら保存し、トークンを Authorization で送る。ファイルとログに平文が無い', async () => {
    const authorizations = serveUser(() => recordedUserResponse())
    const { service, published, logger, settings } = launch()
    await service.prepare()

    await expect(service.submitPat(`${TOKEN}\n`)).resolves.toEqual({
      ok: true,
      value: { login: 'alice' },
    })
    expect(authorizations).toEqual([`Bearer ${TOKEN}`])
    expect(published.at(-1)).toEqual({
      auth: { status: 'signed_in', login: 'alice', method: 'pat' },
      ingest: { state: 'syncing' },
    })
    expect(settings.lastLaunchedVersion).toBe('1.2.0')
    expect((await readFile(join(dir, 'token.bin'))).toString()).not.toContain(TOKEN)
    expect(JSON.stringify(logger.entries)).not.toContain(TOKEN)
  })

  it.each([
    [
      'repo が無い（書き換えた応答）',
      () => recordedUserResponse({ 'x-oauth-scopes': 'notifications' }),
      'pat_missing_scope',
    ],
    [
      'スコープのヘッダーが無い。fine-grained PAT（書き換えた応答）',
      () => recordedUserResponse({ 'x-oauth-scopes': null }),
      'pat_missing_scope',
    ],
    [
      '401（書き換えた応答）',
      () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      'pat_invalid',
    ],
    [
      '403 で利用制限の残りが0（書き換えた応答）',
      () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1767229200' },
          },
        ),
      'rate_limited',
    ],
    ['500（書き換えた応答）', () => HttpResponse.json({}, { status: 500 }), 'github_error'],
    ['つながらない', () => HttpResponse.error(), 'offline'],
  ])('%s → %s。保存しない', async (_name, respond, code) => {
    serveUser(respond)
    const { service, published } = launch()
    await service.prepare()
    await expect(service.submitPat(TOKEN)).resolves.toEqual({ ok: false, error: { code } })
    await expect(readFile(join(dir, 'token.bin'))).rejects.toThrow()
    expect(published).toEqual([])
  })
})

describe('立ち上げ直しとサインアウト（auth-flow.md 4.・6.）', () => {
  it('保存したトークンで、立ち上げ直したときに GET /user で確かめる（同じ版なら案内を出さない）', async () => {
    serveUser(() => recordedUserResponse())
    const first = launch()
    await first.service.prepare()
    await first.service.submitPat(TOKEN)

    const authorizations = serveUser(() => recordedUserResponse())
    const second = launch(first.settings)
    await expect(second.service.prepare()).resolves.toEqual({
      auth: { status: 'signed_in', method: 'pat' },
      ingest: { state: 'syncing' },
    })
    second.service.resume()
    await vi.waitFor(() =>
      expect(second.published.at(-1)).toEqual({
        auth: { status: 'signed_in', login: 'alice', method: 'pat' },
        ingest: { state: 'syncing' },
      }),
    )
    expect(authorizations).toEqual([`Bearer ${TOKEN}`])
  })

  it('立ち上げ直したときに 401 なら、認証が切れたとする（書き換えた応答）', async () => {
    serveUser(() => recordedUserResponse())
    const first = launch()
    await first.service.prepare()
    await first.service.submitPat(TOKEN)

    serveUser(() => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }))
    const second = launch(first.settings)
    await second.service.prepare()
    second.service.resume()
    await vi.waitFor(() =>
      expect(second.published.at(-1)).toEqual({
        auth: { status: 'auth_failed', method: 'pat' },
        ingest: { state: 'auth_failed' },
      }),
    )
  })

  it('サインアウトしたら、トークンのファイルを消す', async () => {
    serveUser(() => recordedUserResponse())
    const { service } = launch()
    await service.prepare()
    await service.submitPat(TOKEN)
    await service.signOut()
    await expect(readFile(join(dir, 'token.bin'))).rejects.toThrow()
    const next = launch()
    await expect(next.service.prepare()).resolves.toEqual({
      auth: { status: 'signed_out' },
      ingest: { state: 'signed_out' },
    })
  })
})
