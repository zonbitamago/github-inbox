// PR の一覧の検索（github-api.md 5.）。検索3本のそれぞれを、GraphQL の search で取る。
// 3本を同時に投げて、まとめて自分待ちの理由を付けるのは pr-list（component-backend.md 5.3）。
// 100件を超えたら after で続きを取る。境目は時刻で数える（日付で数えない。DR-17）。
import { z } from 'zod'
import { DAY_MS } from '../core/constants'
import type { GhSearchPullRequest, GhSearchPullRequestStatus } from '../core/github-shapes'
import { githubTimestamp, type GitHubClient, type GitHubFailure } from './client'

export type PrSearchResult<T> =
  /** skipped は、読めずに飛ばした PR の数（nodes の null。ログに書くため） */
  { kind: 'ok'; nodes: T[]; skipped: number } | { kind: 'failed'; failure: GitHubFailure }

/** GitHub の検索は1,000件（100件 × 10ページ）までしか返さない */
const MAX_PAGES = 10

const SECOND_MS = 1000

/** 境目: 今の時刻 − 期間の日数（github-api.md 5.） */
export function prSearchBoundary(now: Date, periodDays: number): string {
  return githubTimestamp(new Date(now.getTime() - periodDays * DAY_MS).toISOString())
}

// ---- 問い合わせの文（github-api.md 5. の項目のまま。続きを取るため $after を足した） ----

const searchQuery = (fields: string) => `query Search($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${fields} } }
  }
}`

const PULL_REQUEST_QUERY = searchQuery(
  'id number title url state isDraft updatedAt author { login __typename } repository { nameWithOwner } assignees(first: 10) { nodes { login } }',
)
const STATUS_QUERY = searchQuery(
  'id reviewDecision latestOpinionatedReviews(first: 20, writersOnly: true) { nodes { state } } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }',
)

// ---- 応答の検査（使う項目だけ。core/github-shapes の形） ----

const AuthorSchema = z.object({ login: z.string().min(1), __typename: z.string() })

const PullRequestSchema = z.object({
  id: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  url: z.string().min(1),
  state: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.iso.datetime(),
  author: AuthorSchema.nullable(),
  repository: z.object({ nameWithOwner: z.string().min(1) }),
  assignees: z.object({ nodes: z.array(z.object({ login: z.string().min(1) })) }),
})

const StatusSchema = z.object({
  id: z.string().min(1),
  reviewDecision: z.string().nullable(),
  latestOpinionatedReviews: z.object({ nodes: z.array(z.object({ state: z.string() })) }),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({ statusCheckRollup: z.object({ state: z.string() }).nullable() }),
      }),
    ),
  }),
})

const ResponseSchema = z.object({
  data: z
    .object({
      search: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(z.unknown()),
      }),
    })
    .nullish(),
  errors: z.array(z.object({ type: z.string().optional() })).optional(),
})

const githubError = (status: number) =>
  ({ kind: 'failed', failure: { kind: 'github_error', status } }) as const

async function searchAll<T>(
  client: GitHubClient,
  request: { endpoint: string; query: string; q: string },
  schema: z.ZodType<T>,
): Promise<PrSearchResult<T>> {
  const nodes: T[] = []
  let skipped = 0
  let after: string | null = null
  const visited = new Set<string>()
  for (let pageCount = 0; pageCount < MAX_PAGES; pageCount += 1) {
    const result = await client.graphql({
      endpoint: request.endpoint,
      query: request.query,
      variables: { q: request.q, after },
    })
    if (result.kind === 'failed') return result
    if (result.kind === 'not_modified') return githubError(304)
    const parsed = ResponseSchema.safeParse(result.body)
    if (!parsed.success) return githubError(result.status)
    // 利用制限は 200 と errors で返ることがある。止める時刻はヘッダーで分かる
    if (parsed.data.errors?.some((error) => error.type === 'RATE_LIMITED') === true) {
      const reset = Number(result.headers.get('x-ratelimit-reset') ?? Number.NaN)
      return Number.isFinite(reset)
        ? {
            kind: 'failed',
            failure: { kind: 'rate_limited', retryAt: new Date(reset * SECOND_MS) },
          }
        : githubError(result.status)
    }
    const search = parsed.data.data?.search
    if (search === undefined) return githubError(result.status)
    for (const node of search.nodes) {
      // 読めない PR（権限が無いなど）は null で届き、errors に理由が入る。一覧からは外す
      if (node === null) {
        skipped += 1
        continue
      }
      const item = schema.safeParse(node)
      if (!item.success) return githubError(result.status)
      nodes.push(item.data)
    }
    const { hasNextPage, endCursor } = search.pageInfo
    if (!hasNextPage || endCursor === null || visited.has(endCursor)) break
    visited.add(endCursor)
    after = endCursor
  }
  return { kind: 'ok', nodes, skipped }
}

/** 検索 A: 自分に関わった PR（github-prs と同じ範囲。`assigned` の材料） */
export function searchInvolves(
  client: GitHubClient,
  boundary: string,
): Promise<PrSearchResult<GhSearchPullRequest>> {
  return searchAll(
    client,
    {
      endpoint: 'pr_search_involves',
      query: PULL_REQUEST_QUERY,
      q: `is:pr involves:@me updated:>${boundary}`,
    },
    PullRequestSchema,
  )
}

/** 検索 B: レビュー依頼が来ている PR（チーム宛てを含む。`review_pending` の材料） */
export function searchReviewRequested(
  client: GitHubClient,
  boundary: string,
): Promise<PrSearchResult<GhSearchPullRequest>> {
  return searchAll(
    client,
    {
      endpoint: 'pr_search_review_requested',
      query: PULL_REQUEST_QUERY,
      q: `is:pr review-requested:@me updated:>${boundary}`,
    },
    PullRequestSchema,
  )
}

/** 検索 C: 自分の open の PR の状態（`changes_requested`・`approved`・`ci_failed` の材料） */
export function searchOwnOpen(
  client: GitHubClient,
  boundary: string,
): Promise<PrSearchResult<GhSearchPullRequestStatus>> {
  return searchAll(
    client,
    {
      endpoint: 'pr_search_own_open',
      query: STATUS_QUERY,
      q: `is:pr is:open author:@me updated:>${boundary}`,
    },
    StatusSchema,
  )
}
