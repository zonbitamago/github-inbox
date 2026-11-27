import { describe, expect, it } from 'vitest'
import searchA from '../../../test/fixtures/github/graphql-search-a-involves.json'
import searchB from '../../../test/fixtures/github/graphql-search-b-review-requested.json'
import searchC from '../../../test/fixtures/github/graphql-search-c-own-open.json'
import {
  createFakeGitHubClient,
  failedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import { VIEWER } from '../../../test/support/github-fixtures'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import type { AppState, PrListSnapshot } from '../../shared/ipc-contract'
import type { GitHubFailure, GitHubResult, GraphQLRequest } from '../github/client'
import { PrListService } from './pr-list-service'

const NOW = new Date('2026-01-31T00:00:00Z')

const RECORDED: Record<string, typeof searchA | typeof searchB | typeof searchC> = {
  pr_search_involves: searchA,
  pr_search_review_requested: searchB,
  pr_search_own_open: searchC,
}

/** 検索3本に、記録した応答を返す。answer で1本ずつ差し替えられる */
function recordedAnswer(
  answer: (request: GraphQLRequest) => GitHubResult | undefined = () => undefined,
) {
  return (request: GraphQLRequest): GitHubResult => {
    const answered = answer(request)
    if (answered !== undefined) return answered
    const recorded = RECORDED[request.endpoint]
    if (recorded === undefined) throw new Error(`想定外の問い合わせ ${request.endpoint}`)
    return okResult(recorded.response.body, recorded.response.headers)
  }
}

/** 応答を手で返せる GitHub（取得中の振る舞いを確かめる） */
function deferredClient() {
  const pending: { request: GraphQLRequest; resolve: (result: GitHubResult) => void }[] = []
  const client = {
    get: () => Promise.reject(new Error('想定外の GET')),
    graphql: (request: GraphQLRequest) =>
      new Promise<GitHubResult>((resolve) => pending.push({ request, resolve })),
  }
  const answerAll = (answer = recordedAnswer()) => {
    for (const { request, resolve } of pending.splice(0)) resolve(answer(request))
  }
  return { client, pending, answerAll }
}

function setup(
  options: {
    answer?: (request: GraphQLRequest) => GitHubResult | undefined
    periodDays?: number
  } = {},
) {
  const client = createFakeGitHubClient({ graphql: recordedAnswer(options.answer) })
  return { ...build(client, options.periodDays), client }
}

function build(client: ConstructorParameters<typeof PrListService>[0]['client'], periodDays = 7) {
  const logger = createMemoryLogger()
  const views: AppState['prList'][] = []
  const snapshots: PrListSnapshot[] = []
  let authFailed = 0
  const service = new PrListService({
    client,
    periodDays: () => periodDays,
    now: () => NOW,
    logger,
    publish: (view) => views.push(view),
    updated: (snapshot) => snapshots.push(snapshot),
    authFailed: () => {
      authFailed += 1
    },
  })
  return { service, logger, views, snapshots, authFailedCount: () => authFailed }
}

describe('PR の一覧を取る（component-backend.md 5.3、F-15・F-20）', () => {
  it('サインインしたら検索3本を同時に投げ、まとめて自分待ちの理由を付けて画面に送る', async () => {
    const { service, client, views, snapshots } = setup()
    const result = await service.start(VIEWER)

    expect(client.queries.map((request) => request.endpoint).toSorted()).toEqual([
      'pr_search_involves',
      'pr_search_own_open',
      'pr_search_review_requested',
    ])
    expect(result.ok).toBe(true)
    const [snapshot] = snapshots
    // A の48件と B の1件。B の PR は A にも入っているので、1つにまとめる
    expect(snapshot?.items).toHaveLength(48)
    expect(snapshot?.periodDays).toBe(7)
    expect(snapshot?.fetchedAt).toBe(NOW.toISOString())
    // 更新の新しい順
    const updated = snapshot?.items.map((item) => item.updatedAt) ?? []
    expect(updated).toEqual(updated.toSorted().toReversed())
    expect(snapshot?.items.find((item) => item.number === 121)?.waitingReasons).toEqual([
      'review_pending',
    ])
    expect(views).toEqual([{ loading: true }, { loading: false }])
    expect(service.current()).toEqual(snapshot)
  })

  it('検索の境目は、設定の期間の日数だけ前（F-16）', async () => {
    const { service, client } = setup({ periodDays: 30 })
    await service.start(VIEWER)

    for (const request of client.queries) {
      expect(request.variables['q']).toContain('updated:>2026-01-01T00:00:00Z')
    }
  })

  it('取った件数と時間をログに書く。タイトルは書かない（Q-15）', async () => {
    const { service, logger } = setup()
    await service.start(VIEWER)

    expect(logger.entries).toEqual([
      {
        level: 'info',
        kind: 'pr_list.fetched',
        fields: { count: 48, periodDays: 7, ms: 0, skipped: 0 },
      },
    ])
  })

  it('読めずに飛ばした PR の数もログに書く（書き換えた応答）', async () => {
    const [first] = searchA.response.body.data.search.nodes
    const { service, logger } = setup({
      answer: (request) =>
        request.endpoint === 'pr_search_involves'
          ? okResult({
              data: {
                search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [first, null] },
              },
              errors: [{ type: 'FORBIDDEN' }],
            })
          : undefined,
    })
    await service.start(VIEWER)

    expect(logger.entries[0]?.fields).toMatchObject({ count: 2, skipped: 1 })
  })

  it('サインインする前のリロードは not_signed_in を返し、問い合わせない', async () => {
    const { service, client } = setup()

    await expect(service.reload()).resolves.toEqual({
      ok: false,
      error: { code: 'not_signed_in' },
    })
    expect(client.queries).toEqual([])
    expect(service.current()).toBeNull()
  })

  it('リロードで取り直す（F-20）', async () => {
    const { service, client, snapshots } = setup()
    await service.start(VIEWER)
    const result = await service.reload()

    expect(client.queries).toHaveLength(6)
    expect(snapshots).toHaveLength(2)
    expect(result).toEqual({ ok: true, value: snapshots[1] })
  })
})

describe('取得中にもう一度頼まれたとき（component-backend.md 5.3）', () => {
  it('リロードは新しく投げず、今の取得の結果を返す', async () => {
    const { client, pending, answerAll } = deferredClient()
    const { service, snapshots } = build(client)
    const first = service.start(VIEWER)
    const second = service.reload()
    expect(pending).toHaveLength(3)
    answerAll()

    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(snapshots).toHaveLength(1)
  })

  it('サインインし直したら、前の取得の結果は捨てて取り直す（別のアカウントの一覧を出さない）', async () => {
    const { client, pending, answerAll } = deferredClient()
    const { service, snapshots, views } = build(client)
    const old = service.start('someone-else')
    service.stop()
    const current = service.start(VIEWER)
    expect(pending).toHaveLength(6)
    answerAll()

    const [oldResult, currentResult] = await Promise.all([old, current])
    expect(snapshots).toHaveLength(1)
    // 捨てた取得を待っていた頼みにも、新しい取得の結果を返す
    expect(oldResult).toEqual(currentResult)
    expect(views.at(-1)).toEqual({ loading: false })
  })

  it('取得中に止めたら（認証が切れた・サインアウト）、結果を捨て、取得中を解く', async () => {
    const { client, answerAll } = deferredClient()
    const { service, snapshots, views } = build(client)
    const fetching = service.start(VIEWER)
    service.stop()
    answerAll()

    await expect(fetching).resolves.toEqual({ ok: false, error: { code: 'not_signed_in' } })
    expect(snapshots).toEqual([])
    expect(views).toEqual([{ loading: true }, { loading: false }])
  })
})

describe('止める・消す（auth-flow.md 5.・6.）', () => {
  it('止めても（認証が切れた）、最後に取った一覧は残す。リロードは not_signed_in', async () => {
    const { service, views } = setup()
    await service.start(VIEWER)
    const kept = service.current()
    service.stop()

    expect(service.current()).toEqual(kept)
    await expect(service.reload()).resolves.toEqual({
      ok: false,
      error: { code: 'not_signed_in' },
    })
    expect(views.at(-1)).toEqual({ loading: false, error: 'not_signed_in' })
  })

  it('サインアウトしたら、前のアカウントの一覧を消す', async () => {
    const { service, views } = setup()
    await service.start(VIEWER)
    service.stop()
    service.clear()

    expect(service.current()).toBeNull()
    expect(views.at(-1)).toEqual({ loading: false })
  })
})

describe('失敗（ipc-contract.md 4.、component-backend.md 6.3）', () => {
  it.each<[string, GitHubFailure, string]>([
    ['つながらない', { kind: 'offline' }, 'offline'],
    ['利用制限', { kind: 'rate_limited', retryAt: NOW }, 'rate_limited'],
    ['GitHub の障害', { kind: 'github_error', status: 502 }, 'github_error'],
    ['403・404', { kind: 'not_accessible', status: 404 }, 'github_error'],
    ['認証が切れた', { kind: 'auth_failed' }, 'auth_failed'],
  ])('%s は %s として返し、画面に出す。前の一覧は残す', async (_name, failure, code) => {
    let failing = false
    const { service, views, snapshots, logger } = setup({
      answer: (request) =>
        failing && request.endpoint === 'pr_search_own_open' ? failedResult(failure) : undefined,
    })
    await service.start(VIEWER)
    failing = true
    const result = await service.reload()

    expect(result).toEqual({ ok: false, error: { code } })
    expect(views.at(-1)).toEqual({ loading: false, error: code })
    expect(snapshots).toHaveLength(1)
    expect(service.current()).toEqual(snapshots[0])
    expect(logger.entries.at(-1)).toEqual({
      level: 'warn',
      kind: 'pr_list.failed',
      fields: { failure: failure.kind },
    })
  })

  it('401 を受けたら、認証の側に知らせる（auth-flow.md 5.）', async () => {
    const { service, authFailedCount } = setup({
      answer: () => failedResult({ kind: 'auth_failed' }),
    })
    await service.start(VIEWER)
    expect(authFailedCount()).toBe(1)
  })

  it('複数の検索が失敗したら、重い方（認証 → 利用制限 → つながらない → 障害）を返す', async () => {
    const { service } = setup({
      answer: (request) =>
        request.endpoint === 'pr_search_involves'
          ? failedResult({ kind: 'offline' })
          : failedResult({ kind: 'rate_limited', retryAt: NOW }),
    })
    await expect(service.start(VIEWER)).resolves.toEqual({
      ok: false,
      error: { code: 'rate_limited' },
    })
  })

  it('次に取れたら、失敗の表示を消す', async () => {
    let failing = true
    const { service, views } = setup({
      answer: () => (failing ? failedResult({ kind: 'offline' }) : undefined),
    })
    await service.start(VIEWER)
    failing = false
    await service.reload()

    expect(views).toEqual([
      { loading: true },
      { loading: false, error: 'offline' },
      { loading: true },
      { loading: false },
    ])
  })

  it('思いがけない例外は internal として返し、ログに残す', async () => {
    const client = {
      get: () => Promise.reject(new Error('想定外の GET')),
      graphql: () => Promise.reject(new TypeError('bug')),
    }
    const { service, views, logger } = build(client)

    await expect(service.start(VIEWER)).resolves.toEqual({
      ok: false,
      error: { code: 'internal' },
    })
    expect(views.at(-1)).toEqual({ loading: false, error: 'internal' })
    expect(logger.entries).toEqual([
      { level: 'error', kind: 'pr_list.unexpected', fields: { error: 'TypeError' } },
    ])
  })
})
