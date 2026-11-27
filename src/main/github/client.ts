// GitHub への HTTP の共通部分（component-backend.md 3.・6.、github-api.md 1.）。
// 送るのは REST の GET と、GraphQL の query だけ（N-06、security-rules.md S-07）。GraphQL の POST はここだけで行う。
// 想定内の失敗は例外にせず、分類した値で返す（coding-standards.md 4.、component-backend.md 6.3）。
// トークンは持たず、問い合わせのたびに getToken で受け取る（I-7、auth-flow.md 4.）。
import { GITHUB_REQUEST_TIMEOUT_MS, POLL_INTERVAL_MS } from '../core/constants'
import type { Logger, LogFields } from '../log/logger'
import type { RateBudget } from './rate-budget'

export const GITHUB_API_BASE_URL = 'https://api.github.com'

export type GitHubFailure =
  | { kind: 'offline' }
  | { kind: 'auth_failed' }
  | { kind: 'rate_limited'; retryAt: Date }
  /** 1つのリポジトリだけの 403・404（権限が無い、消えた）。受け取りの状態は変えない（6.3） */
  | { kind: 'not_accessible'; status: number }
  | { kind: 'github_error'; status: number }

export type GitHubResult =
  | { kind: 'ok'; status: number; headers: Headers; body: unknown }
  | { kind: 'not_modified'; headers: Headers }
  | { kind: 'failed'; failure: GitHubFailure }

export interface GetRequest {
  /** ログに書く問い合わせ先の種類。パスはリポジトリ名を含みうるため書かない（S-09） */
  endpoint: string
  /** `/` で始まるパス。クエリを含めてよい */
  path: string
  headers?: Record<string, string>
}

export interface GraphQLRequest {
  /** ログに書く問い合わせ先の種類 */
  endpoint: string
  /** `query` で始まる文。`mutation` は書かない（N-06） */
  query: string
  /** 検索語・リポジトリ名・番号は変数で渡し、文に埋め込まない（github-api.md 1.） */
  variables: Record<string, unknown>
}

export interface GitHubClient {
  get(request: GetRequest): Promise<GitHubResult>
  /** POST /graphql。GraphQL の errors は本文のまま返す（別名ごとに扱うため。github-api.md 3.） */
  graphql(request: GraphQLRequest): Promise<GitHubResult>
}

export interface GitHubClientDeps {
  /** テストで偽物に差し替える。無ければ Node.js の fetch（fetch は github/ の中だけで使う。coding-standards.md 2.） */
  fetch?: typeof fetch
  getToken: () => string | undefined
  rateBudget: RateBudget
  logger: Logger
  /** `github-inbox/<版>` */
  userAgent: string
  now: () => Date
}

const SECOND_MS = 1000

/** 利用制限の枠。REST の検索だけ別の枠になる（GitHub の決まり） */
function resourceOf(path: string): string {
  return path.startsWith('/search/') ? 'search' : 'core'
}

/** パスから問い合わせ先を作る。api.github.com の外を指すものは、トークンを送らないよう断る */
function urlOf(path: string): URL {
  const base = new URL(GITHUB_API_BASE_URL)
  const url = new URL(path, base)
  if (!path.startsWith('/') || path.startsWith('//') || url.origin !== base.origin) {
    throw new Error('github_path_not_allowed')
  }
  return url
}

/** 読み取りだけの GraphQL か（mutation・subscription を送らない。S-07） */
const QUERY_ONLY = /^\s*query\b/

/**
 * GitHub に渡す時刻の形（YYYY-MM-DDTHH:MM:SSZ。github-api.md 2.・3.）。ミリ秒は切り捨てる。
 * 切り捨てると少し早い時刻になるだけで、取りこぼしは無い（重なった出典は id で1件になる。I-1）
 */
export function githubTimestamp(iso: string): string {
  return new Date(Math.floor(Date.parse(iso) / 1000) * 1000).toISOString().replace('.000Z', 'Z')
}

/** api.github.com の URL（応答の中の次のページ・最新のコメントなど）を、client に渡せるパスにする。外を指すなら undefined */
export function apiPathOf(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.origin !== new URL(GITHUB_API_BASE_URL).origin) return undefined
  return `${url.pathname}${url.search}`
}

/** Link ヘッダーの rel="next" のパス（github-api.md 2.・4.） */
export function nextPagePath(headers: Headers): string | undefined {
  const link = headers.get('link')
  if (link === null) return undefined
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="next"\s*$/.exec(part)
    if (match?.[1] !== undefined) return apiPathOf(match[1])
  }
  return undefined
}

function classify(status: number, headers: Headers, now: Date): GitHubFailure | undefined {
  if (status === 401) return { kind: 'auth_failed' }
  if (status === 403 || status === 429) {
    const retryAfter = Number(headers.get('retry-after') ?? Number.NaN)
    if (Number.isFinite(retryAfter)) {
      return { kind: 'rate_limited', retryAt: new Date(now.getTime() + retryAfter * SECOND_MS) }
    }
    const reset = Number(headers.get('x-ratelimit-reset') ?? Number.NaN)
    if (headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset)) {
      return { kind: 'rate_limited', retryAt: new Date(reset * SECOND_MS) }
    }
    // 二次的な利用制限で待つ時刻の指示が無いときは、少なくとも1分待つ（GitHub の案内）
    if (status === 429) {
      return { kind: 'rate_limited', retryAt: new Date(now.getTime() + POLL_INTERVAL_MS) }
    }
    return { kind: 'not_accessible', status }
  }
  if (status === 404) return { kind: 'not_accessible', status }
  if (status < 200 || status >= 300) return { kind: 'github_error', status }
  return undefined
}

interface SendOptions {
  endpoint: string
  url: URL
  /** 利用制限の枠（core・search・graphql） */
  resource: string
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }
}

export function createGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const send = deps.fetch ?? ((input, init) => fetch(input, init))
  const fail = (endpoint: string, failure: GitHubFailure, extra: LogFields = {}): GitHubResult => {
    deps.logger.warn('github.request_failed', { endpoint, failure: failure.kind, ...extra })
    return { kind: 'failed', failure }
  }

  async function request({ endpoint, url, resource, init }: SendOptions): Promise<GitHubResult> {
    const token = deps.getToken()
    if (token === undefined) return fail(endpoint, { kind: 'auth_failed' })
    const blockedUntil = deps.rateBudget.blockedUntil(resource, deps.now())
    if (blockedUntil !== undefined) {
      return fail(endpoint, { kind: 'rate_limited', retryAt: blockedUntil })
    }

    const started = deps.now().getTime()
    const response = await deps.rateBudget.run(async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
      try {
        return await send(url, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': deps.userAgent,
          },
          signal: controller.signal,
        })
      } catch {
        // つながらない・時間切れ。例外の文言は使わない（何が入るか分からないため）
        return undefined
      } finally {
        clearTimeout(timer)
      }
    })
    if (response === undefined) return fail(endpoint, { kind: 'offline' })

    const now = deps.now()
    deps.rateBudget.observe(response.headers, now)
    const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? Number.NaN)
    const fields: LogFields = {
      endpoint,
      status: response.status,
      ms: now.getTime() - started,
      resource: response.headers.get('x-ratelimit-resource') ?? undefined,
      remaining: Number.isNaN(remaining) ? undefined : remaining,
    }

    if (response.status === 304) {
      deps.logger.info('github.request', fields)
      return { kind: 'not_modified', headers: response.headers }
    }
    const failure = classify(response.status, response.headers, now)
    if (failure !== undefined) return fail(endpoint, failure, { status: response.status })

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return fail(
        endpoint,
        { kind: 'github_error', status: response.status },
        { status: response.status },
      )
    }
    deps.logger.info('github.request', fields)
    return { kind: 'ok', status: response.status, headers: response.headers, body }
  }

  return {
    async get({ endpoint, path, headers = {} }) {
      const url = urlOf(path)
      return await request({
        endpoint,
        url,
        resource: resourceOf(path),
        init: { method: 'GET', headers },
      })
    },
    async graphql({ endpoint, query, variables }) {
      if (!QUERY_ONLY.test(query)) throw new Error('github_graphql_query_only')
      return await request({
        endpoint,
        url: urlOf('/graphql'),
        resource: 'graphql',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables }),
        },
      })
    },
  }
}

export type PagesResult<T> =
  /** headers は最初のページのもの（ETag・X-Poll-Interval を読むため） */
  | { kind: 'ok'; items: T[]; headers: Headers }
  | { kind: 'not_modified'; headers: Headers }
  | { kind: 'failed'; failure: GitHubFailure }

/**
 * 最初のページから Link の rel="next" をたどって、全部のページを取る（github-api.md 2.・4.）。
 * parse が undefined を返したら、形が合わない応答として github_error にする（component-backend.md 6.3）。
 * 最初のページの 304 は not_modified、続きのページの 304 は想定外として github_error にする。
 */
export async function getAllPages<T>(
  client: GitHubClient,
  first: GetRequest,
  parse: (body: unknown) => T[] | undefined,
): Promise<PagesResult<T>> {
  const firstResult = await client.get(first)
  if (firstResult.kind !== 'ok') return firstResult
  const firstItems = parse(firstResult.body)
  if (firstItems === undefined) {
    return { kind: 'failed', failure: { kind: 'github_error', status: firstResult.status } }
  }
  const items = [...firstItems]
  const visited = new Set([first.path])
  let next = nextPagePath(firstResult.headers)
  while (next !== undefined && !visited.has(next)) {
    visited.add(next)
    const result = await client.get({ endpoint: first.endpoint, path: next })
    if (result.kind === 'failed') return result
    if (result.kind === 'not_modified') {
      return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
    }
    const page = parse(result.body)
    if (page === undefined) {
      return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
    }
    items.push(...page)
    next = nextPagePath(result.headers)
  }
  return { kind: 'ok', items, headers: firstResult.headers }
}
