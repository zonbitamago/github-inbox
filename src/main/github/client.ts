// GitHub への HTTP の共通部分（component-backend.md 3.・6.、github-api.md 1.）。
// 送るのは GET だけ（N-06、security-rules.md S-07）。GraphQL は S3 で足す。
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

export interface GitHubClient {
  get(request: GetRequest): Promise<GitHubResult>
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

export function createGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const send = deps.fetch ?? ((input, init) => fetch(input, init))
  const fail = (endpoint: string, failure: GitHubFailure, extra: LogFields = {}): GitHubResult => {
    deps.logger.warn('github.request_failed', { endpoint, failure: failure.kind, ...extra })
    return { kind: 'failed', failure }
  }

  return {
    async get({ endpoint, path, headers = {} }) {
      const url = urlOf(path)
      const token = deps.getToken()
      if (token === undefined) return fail(endpoint, { kind: 'auth_failed' })
      const resource = resourceOf(path)
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
            method: 'GET',
            headers: {
              ...headers,
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
    },
  }
}
