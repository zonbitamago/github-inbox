import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { createGitHubClient, type GitHubClientDeps } from './client'
import { RateBudget } from './rate-budget'

const NOW = new Date('2026-01-01T00:00:00Z')
const TOKEN = 'test-token-not-real'

type FetchArgs = Parameters<typeof fetch>

function setup(
  respond: (...args: FetchArgs) => Promise<Response>,
  change: Partial<GitHubClientDeps> = {},
) {
  const fetchMock = vi.fn(respond)
  const logger = createMemoryLogger()
  const rateBudget = new RateBudget()
  const client = createGitHubClient({
    fetch: fetchMock,
    getToken: () => TOKEN,
    rateBudget,
    logger,
    userAgent: 'github-inbox/0.1.0',
    now: () => NOW,
    ...change,
  })
  return { client, fetchMock, logger, rateBudget }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers }))

const request = { endpoint: 'user', path: '/user' }

afterEach(() => {
  vi.useRealTimers()
})

describe('問い合わせの形（github-api.md 1.）', () => {
  it('api.github.com に GET で、決めたヘッダーを付けて問い合わせる', async () => {
    const { client, fetchMock } = setup(() => json(200, { login: 'alice' }))
    await client.get({ ...request, headers: { 'If-None-Match': '"etag"' } })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toEqual(new URL('https://api.github.com/user'))
    expect(init?.method).toBe('GET')
    const sent = new Headers(init?.headers)
    expect(sent.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(sent.get('accept')).toBe('application/vnd.github+json')
    expect(sent.get('x-github-api-version')).toBe('2022-11-28')
    expect(sent.get('user-agent')).toBe('github-inbox/0.1.0')
    expect(sent.get('if-none-match')).toBe('"etag"')
  })

  it.each([
    ['別のホストを指すパス', '//example.com/user'],
    ['URL そのもの', 'https://example.com/user'],
    ['/ で始まらないパス', 'user'],
  ])('%s は問い合わせずに断る（トークンを外に送らない）', async (_name, path) => {
    const { client, fetchMock } = setup(() => json(200, {}))
    await expect(client.get({ endpoint: 'user', path })).rejects.toThrow('github_path_not_allowed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('トークンが無ければ問い合わせず、認証が切れたとする', async () => {
    const { client, fetchMock } = setup(() => json(200, {}), { getToken: () => undefined })
    await expect(client.get(request)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'auth_failed' },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('応答の分類（component-backend.md 6.3）', () => {
  it('200 は本文を返し、利用制限の残りを覚える', async () => {
    const { client, rateBudget } = setup(() =>
      json(
        200,
        { login: 'alice' },
        {
          'x-ratelimit-resource': 'core',
          'x-ratelimit-remaining': '4868',
          'x-ratelimit-reset': '1767229200',
        },
      ),
    )
    const result = await client.get(request)
    expect(result).toMatchObject({ kind: 'ok', status: 200, body: { login: 'alice' } })
    expect(rateBudget.remaining('core')?.remaining).toBe(4868)
  })

  it('304 は変わっていないとする', async () => {
    const { client } = setup(() => Promise.resolve(new Response(null, { status: 304 })))
    await expect(client.get(request)).resolves.toMatchObject({ kind: 'not_modified' })
  })

  it.each([
    ['401', 401, {}, { kind: 'auth_failed' }],
    [
      '403 で残りが0',
      403,
      { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1767229200' },
      { kind: 'rate_limited', retryAt: new Date('2026-01-01T01:00:00Z') },
    ],
    [
      '429 で retry-after',
      429,
      { 'retry-after': '30' },
      { kind: 'rate_limited', retryAt: new Date('2026-01-01T00:00:30Z') },
    ],
    [
      '429 で待つ時刻の指示が無い',
      429,
      {},
      { kind: 'rate_limited', retryAt: new Date('2026-01-01T00:01:00Z') },
    ],
    [
      '403（権限が無い）',
      403,
      { 'x-ratelimit-remaining': '4000' },
      { kind: 'not_accessible', status: 403 },
    ],
    ['404（消えた）', 404, {}, { kind: 'not_accessible', status: 404 }],
    ['500', 500, {}, { kind: 'github_error', status: 500 }],
    ['422（想定外）', 422, {}, { kind: 'github_error', status: 422 }],
  ])('%s', async (_name, status, headers, failure) => {
    const { client } = setup(() => json(status, { message: 'x' }, headers))
    await expect(client.get(request)).resolves.toEqual({ kind: 'failed', failure })
  })

  it('本文が JSON でなければ、想定外の応答とする', async () => {
    const { client } = setup(() => Promise.resolve(new Response('<html>', { status: 200 })))
    await expect(client.get(request)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('つながらなければ offline とする', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('fetch failed')))
    await expect(client.get(request)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'offline' },
    })
  })

  it('30秒で時間切れにし、offline とする（github-api.md 1.）', async () => {
    vi.useFakeTimers()
    const { client } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const result = client.get(request)
    await vi.advanceTimersByTimeAsync(29_999)
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ kind: 'failed', failure: { kind: 'offline' } })
  })

  it('止める時刻の間は問い合わせず、利用制限にかかったとする（component-backend.md 6.1）', async () => {
    const { client, fetchMock, rateBudget } = setup(() => json(200, {}))
    rateBudget.observe(new Headers({ 'retry-after': '60' }), NOW)
    await expect(client.get(request)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'rate_limited', retryAt: new Date('2026-01-01T00:01:00Z') },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ログ（security-rules.md S-09）', () => {
  it('問い合わせ先の種類・状態コード・残りだけを書き、パスとトークンは書かない', async () => {
    const { client, logger } = setup(() =>
      json(
        200,
        { login: 'alice' },
        {
          'x-ratelimit-resource': 'core',
          'x-ratelimit-remaining': '4868',
          'x-ratelimit-reset': '1767229200',
        },
      ),
    )
    await client.get({
      endpoint: 'repo_notifications',
      path: '/repos/example-org/app/notifications',
    })
    expect(logger.entries).toEqual([
      {
        level: 'info',
        kind: 'github.request',
        fields: {
          endpoint: 'repo_notifications',
          status: 200,
          ms: 0,
          resource: 'core',
          remaining: 4868,
        },
      },
    ])
    expect(JSON.stringify(logger.entries)).not.toContain('example-org')
    expect(JSON.stringify(logger.entries)).not.toContain(TOKEN)
  })

  it('失敗は分類を書く', async () => {
    const { client, logger } = setup(() => Promise.reject(new TypeError('fetch failed')))
    await client.get(request)
    expect(logger.entries).toEqual([
      {
        level: 'warn',
        kind: 'github.request_failed',
        fields: { endpoint: 'user', failure: 'offline' },
      },
    ])
  })
})
