import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import {
  apiPathOf,
  createGitHubClient,
  githubTimestamp,
  nextPagePath,
  type GitHubClientDeps,
} from './client'
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

describe('GraphQL（github-api.md 1.・3.）', () => {
  const query = 'query Viewer { viewer { login } }'

  it('POST /graphql に、文と変数を本文で送る。利用制限は graphql の枠で覚える', async () => {
    const { client, fetchMock, rateBudget } = setup(() =>
      json(
        200,
        { data: { viewer: { login: 'alice' } } },
        {
          'x-ratelimit-resource': 'graphql',
          'x-ratelimit-remaining': '4900',
          'x-ratelimit-reset': '1767229200',
        },
      ),
    )
    await expect(
      client.graphql({ endpoint: 'graphql.test', query, variables: { n: 1 } }),
    ).resolves.toMatchObject({ kind: 'ok', body: { data: { viewer: { login: 'alice' } } } })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toEqual(new URL('https://api.github.com/graphql'))
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined).toEqual({
      query,
      variables: { n: 1 },
    })
    expect(rateBudget.remaining('graphql')?.remaining).toBe(4900)
    expect(rateBudget.remaining('core')).toBeUndefined()
  })

  it.each([
    ['mutation', 'mutation { markNotificationsAsRead }'],
    ['名前の付いた mutation', '  mutation Mark($id: ID!) { x }'],
    ['subscription', 'subscription { x }'],
    ['query の省略形', '{ viewer { login } }'],
  ])('%s は問い合わせずに断る（N-06）', async (_name, text) => {
    const { client, fetchMock } = setup(() => json(200, {}))
    await expect(
      client.graphql({ endpoint: 'graphql.test', query: text, variables: {} }),
    ).rejects.toThrow('github_graphql_query_only')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GraphQL の枠が止まっている間は、問い合わせずに利用制限とする', async () => {
    const { client, fetchMock, rateBudget } = setup(() => json(200, {}))
    rateBudget.observe(
      new Headers({
        'x-ratelimit-resource': 'graphql',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1767229200',
      }),
      NOW,
    )
    await expect(
      client.graphql({ endpoint: 'graphql.test', query, variables: {} }),
    ).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'rate_limited', retryAt: new Date(1767229200 * 1000) },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('次のページと API の URL（github-api.md 2.・4.）', () => {
  it('Link の rel="next" をパスにする', () => {
    const headers = new Headers({
      link: '<https://api.github.com/notifications?all=true&per_page=50&page=2>; rel="next", <https://api.github.com/notifications?all=true&per_page=50&page=7>; rel="last"',
    })
    expect(nextPagePath(headers)).toBe('/notifications?all=true&per_page=50&page=2')
  })

  it.each([
    ['Link が無い', {}],
    [
      'next が無い（最後のページ）',
      { link: '<https://api.github.com/notifications?page=1>; rel="first"' },
    ],
    [
      'next が api.github.com の外',
      { link: '<https://example.com/notifications?page=2>; rel="next"' },
    ],
  ])('%s → 次は無い', (_name, headers: Record<string, string>) => {
    expect(nextPagePath(new Headers(headers))).toBeUndefined()
  })

  it.each([
    [
      'api.github.com の URL',
      'https://api.github.com/repos/o/r/issues/comments/1',
      '/repos/o/r/issues/comments/1',
    ],
    ['問い合わせの値も残す', 'https://api.github.com/x?a=1', '/x?a=1'],
    ['github.com（ページ）', 'https://github.com/o/r/pull/1', undefined],
    ['http', 'http://api.github.com/x', undefined],
    ['URL でない', 'not a url', undefined],
  ])('%s', (_name, value, expected) => {
    expect(apiPathOf(value)).toBe(expected)
  })
})

describe('GitHub に渡す時刻の形（github-api.md 2.・3.）', () => {
  it.each([
    ['ミリ秒を切り捨てる', '2026-01-30T23:55:00.999Z', '2026-01-30T23:55:00Z'],
    ['ミリ秒が0', '2026-01-30T23:55:00.000Z', '2026-01-30T23:55:00Z'],
    ['もともと秒まで', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
  ])('%s', (_name, iso, expected) => {
    expect(githubTimestamp(iso)).toBe(expected)
  })
})
