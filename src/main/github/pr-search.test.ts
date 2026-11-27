import { describe, expect, it } from 'vitest'
import searchA from '../../../test/fixtures/github/graphql-search-a-involves.json'
import searchB from '../../../test/fixtures/github/graphql-search-b-review-requested.json'
import searchC from '../../../test/fixtures/github/graphql-search-c-own-open.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import type { GitHubResult, GraphQLRequest } from './client'
import { prSearchBoundary, searchInvolves, searchOwnOpen, searchReviewRequested } from './pr-search'

const BOUNDARY = '2026-01-24T00:00:00Z'

const graphqlClient = (answer: (request: GraphQLRequest) => GitHubResult) =>
  createFakeGitHubClient({ graphql: answer })

/** 記録した応答の search を書き換えて、1ページ分の応答にする（書き換えた応答） */
function page(
  recorded: typeof searchA | typeof searchC,
  change: { nodes?: unknown[]; hasNextPage?: boolean; endCursor?: string | null },
): GitHubResult {
  const search = recorded.response.body.data.search
  return okResult(
    {
      data: {
        search: {
          ...search,
          pageInfo: {
            hasNextPage: change.hasNextPage ?? false,
            endCursor:
              change.endCursor === undefined ? search.pageInfo.endCursor : change.endCursor,
          },
          nodes: change.nodes ?? search.nodes,
        },
      },
    },
    recorded.response.headers,
  )
}

describe('検索の境目（github-api.md 5.。今の時刻 − 期間の日数。DR-17）', () => {
  it.each([
    ['7日（既定）', '2026-01-31T12:34:56.789Z', 7, '2026-01-24T12:34:56Z'],
    ['1日（下限）', '2026-01-31T00:00:00.000Z', 1, '2026-01-30T00:00:00Z'],
    ['30日（上限。月をまたぐ）', '2026-01-31T00:00:00.000Z', 30, '2026-01-01T00:00:00Z'],
  ])('%s', (_name, now, days, expected) => {
    expect(prSearchBoundary(new Date(now), days)).toBe(expected)
  })
})

describe('PR の一覧の検索3本（github-api.md 5.）', () => {
  it('検索 A: involves:@me を境目より後の更新で探し、記録した応答の48件を取る', async () => {
    const client = graphqlClient(() => okResult(searchA.response.body, searchA.response.headers))
    const result = await searchInvolves(client, BOUNDARY)

    expect(result.kind === 'ok' ? result.nodes : []).toHaveLength(48)
    expect(result.kind === 'ok' ? result.nodes[0] : undefined).toEqual(
      searchA.response.body.data.search.nodes[0],
    )
    const [query] = client.queries
    expect(query?.variables).toEqual({ q: `is:pr involves:@me updated:>${BOUNDARY}`, after: null })
    expect(query?.endpoint).toBe('pr_search_involves')
  })

  it('検索 B: review-requested:@me（チーム宛てを含む）で探す', async () => {
    const client = graphqlClient(() => okResult(searchB.response.body, searchB.response.headers))
    const result = await searchReviewRequested(client, BOUNDARY)

    expect(result.kind === 'ok' ? result.nodes.map((node) => node.number) : []).toEqual([121])
    expect(client.queries[0]?.variables['q']).toBe(
      `is:pr review-requested:@me updated:>${BOUNDARY}`,
    )
    expect(client.queries[0]?.endpoint).toBe('pr_search_review_requested')
  })

  it('検索 C: 自分の open の PR の状態（判定・レビュー・チェック）を取る', async () => {
    const client = graphqlClient(() => okResult(searchC.response.body, searchC.response.headers))
    const result = await searchOwnOpen(client, BOUNDARY)

    expect(result.kind === 'ok' ? result.nodes : []).toEqual(
      searchC.response.body.data.search.nodes,
    )
    expect(client.queries[0]?.variables['q']).toBe(`is:pr is:open author:@me updated:>${BOUNDARY}`)
    expect(client.queries[0]?.endpoint).toBe('pr_search_own_open')
  })

  it('問い合わせは query だけで、検索語は変数で渡す（github-api.md 1.、N-06）', async () => {
    const client = graphqlClient(() => okResult(searchA.response.body, searchA.response.headers))
    await searchInvolves(client, BOUNDARY)
    await searchOwnOpen(client, BOUNDARY)

    for (const request of client.queries) {
      expect(request.query).toMatch(/^query /)
      expect(request.query).not.toContain('mutation')
      expect(request.query).not.toContain(BOUNDARY)
      expect(request.query).toContain('search(query: $q, type: ISSUE, first: 100, after: $after)')
    }
  })
})

describe('続きのページ（100件を超えたら after でたどる）', () => {
  const [first, second, third] = searchA.response.body.data.search.nodes

  it('hasNextPage が真なら endCursor を after に入れて続きを取り、順につなげる（書き換えた応答）', async () => {
    const client = graphqlClient((request) =>
      request.variables['after'] === null
        ? page(searchA, { nodes: [first, second], hasNextPage: true, endCursor: 'cursor-1' })
        : page(searchA, { nodes: [third], hasNextPage: false }),
    )
    const result = await searchInvolves(client, BOUNDARY)

    expect(client.queries.map((request) => request.variables['after'])).toEqual([null, 'cursor-1'])
    expect(result.kind === 'ok' ? result.nodes.map((node) => node.number) : []).toEqual([
      first?.number,
      second?.number,
      third?.number,
    ])
  })

  it('同じ endCursor が返り続けても、たどるのをやめる（書き換えた応答）', async () => {
    const client = graphqlClient(() =>
      page(searchA, { nodes: [first], hasNextPage: true, endCursor: 'same' }),
    )
    const result = await searchInvolves(client, BOUNDARY)

    expect(client.queries).toHaveLength(2)
    expect(result.kind).toBe('ok')
  })

  it('GitHub の検索が返す上限（1,000件 = 10ページ）より先はたどらない（書き換えた応答）', async () => {
    let count = 0
    const client = graphqlClient(() => {
      count += 1
      return page(searchA, { nodes: [first], hasNextPage: true, endCursor: `cursor-${count}` })
    })
    const result = await searchInvolves(client, BOUNDARY)

    expect(client.queries).toHaveLength(10)
    expect(result.kind === 'ok' ? result.nodes : []).toHaveLength(10)
  })

  it('続きのページで失敗したら、全体を失敗にする', async () => {
    const client = graphqlClient((request) =>
      request.variables['after'] === null
        ? page(searchA, { nodes: [first], hasNextPage: true, endCursor: 'cursor-1' })
        : failedResult({ kind: 'offline' }),
    )
    await expect(searchInvolves(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'offline' },
    })
  })
})

describe('応答の形と失敗（component-backend.md 6.3）', () => {
  const [first] = searchA.response.body.data.search.nodes

  it('読めない PR（nodes の null）は飛ばし、飛ばした数を返す（書き換えた応答）', async () => {
    const client = graphqlClient(() =>
      okResult({
        data: {
          search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [null, first] },
        },
        errors: [{ type: 'FORBIDDEN', path: ['search', 'nodes', 0] }],
      }),
    )
    await expect(searchInvolves(client, BOUNDARY)).resolves.toEqual({
      kind: 'ok',
      nodes: [first],
      skipped: 1,
    })
  })

  it('記録した応答では飛ばしたものは無い', async () => {
    const client = graphqlClient(() => okResult(searchA.response.body, searchA.response.headers))
    const result = await searchInvolves(client, BOUNDARY)
    expect(result.kind === 'ok' ? result.skipped : undefined).toBe(0)
  })

  it.each([
    [
      'PR の項目が欠けている（書き換えた応答）',
      {
        data: {
          search: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ ...first, title: undefined }],
          },
        },
      },
    ],
    ['search が無い（書き換えた応答）', { data: {} }],
    ['data が null（書き換えた応答）', { data: null, errors: [{ type: 'INTERNAL' }] }],
    ['本文が JSON の形でない（書き換えた応答）', 'not json'],
  ])('%s は、GitHub の想定外の応答とする', async (_name, body) => {
    const client = graphqlClient(() => okResult(body))
    await expect(searchInvolves(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('200 で errors に RATE_LIMITED なら、ヘッダーの時刻まで止める（書き換えた応答）', async () => {
    const client = graphqlClient(() =>
      okResult(
        { data: null, errors: [{ type: 'RATE_LIMITED' }] },
        { 'x-ratelimit-reset': '1769817608' },
      ),
    )
    await expect(searchOwnOpen(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'rate_limited', retryAt: new Date(1769817608 * 1000) },
    })
  })

  it('RATE_LIMITED で止める時刻が分からなければ、GitHub の想定外の応答とする（書き換えた応答）', async () => {
    const client = graphqlClient(() => okResult({ data: null, errors: [{ type: 'RATE_LIMITED' }] }))
    await expect(searchOwnOpen(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('変わっていない（304）という応答は、想定外の応答とする', async () => {
    const client = graphqlClient(() => notModifiedResult())
    await expect(searchReviewRequested(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 304 },
    })
  })

  it('問い合わせの失敗はそのまま返す', async () => {
    const client = graphqlClient(() => failedResult({ kind: 'auth_failed' }))
    await expect(searchReviewRequested(client, BOUNDARY)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'auth_failed' },
    })
  })
})
