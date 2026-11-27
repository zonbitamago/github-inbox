// 出来事への分解の材料（github-api.md 3.）。
// 変わったスレッドを20件まで別名（t0…）でまとめ、GraphQL の query 1つで取る。
// $since は断片の中にあり、スレッドごとに分けられないため、since の順に並べて近いものからまとめ、
// まとめた中で一番古い since を使う。スレッドごとの絞り込みは core/expand-thread が行う（CR-009）。
// 続きがあるスレッドだけ、timelineItems は after で、reviews は before でたどる（CR-002）。
import { z } from 'zod'
import { EXPAND_BATCH_SIZE } from '../core/constants'
import type { ExpandSubject } from '../core/expand-thread'
import { githubTimestamp, type GitHubClient, type GitHubFailure } from './client'

export interface ExpandTarget {
  /** GitHub の通知のスレッドの id */
  threadId: string
  kind: 'pull_request' | 'issue'
  owner: string
  name: string
  number: number
  /** スレッドごとの since（core/select-threads） */
  since: string
}

/** そのスレッドだけの失敗の理由（ログに書く）。続けて3回失敗したら記録を進める（component-backend.md 5.2） */
export type SubjectFailureReason =
  'graphql_error' | 'not_found' | 'invalid_shape' | 'not_accessible'

export type SubjectResult =
  { kind: 'ok'; subject: ExpandSubject } | { kind: 'failed'; reason: SubjectFailureReason }

export type ExpandResults =
  /** スレッドの id ごとの結果 */
  | { kind: 'ok'; subjects: Map<string, SubjectResult> }
  /** 問い合わせそのものの失敗（つながらない・認証・利用制限・障害）。その回の取り込みをやり直す */
  | { kind: 'failed'; failure: GitHubFailure }

// ---- 問い合わせの文（github-api.md 3. のまま。続きの問い合わせも同じ項目を取る） ----

const PR_TIMELINE_ITEMS = `pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on IssueComment { id url createdAt body author { login __typename } }
      ... on ReviewRequestedEvent {
        id createdAt actor { login __typename }
        requestedReviewer { __typename ... on User { login } }
      }
      ... on AssignedEvent {
        id createdAt actor { login __typename }
        assignee { __typename ... on User { login } }
      }
    }`

// issue には PullRequestReview・ReviewRequestedEvent の断片を入れられない（入れると問い合わせ全体が失敗する。CR-001）
const ISSUE_TIMELINE_ITEMS = `pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on IssueComment { id url createdAt body author { login __typename } }
      ... on AssignedEvent {
        id createdAt actor { login __typename }
        assignee { __typename ... on User { login } }
      }
    }`

const REVIEWS = `pageInfo { hasPreviousPage startCursor }
    nodes {
      id url state createdAt submittedAt body author { login __typename }
      comments(first: 20) { nodes { url body replyTo { id } } }
    }`

const PR_ITEM_TYPES = '[ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, ASSIGNED_EVENT]'
const ISSUE_ITEM_TYPES = '[ISSUE_COMMENT, ASSIGNED_EVENT]'

const PR_EXPAND = `fragment PrExpand on PullRequest {
  id number title url state isDraft createdAt body
  author { login __typename }
  viewerLatestReview { state }
  timelineItems(since: $since, first: 100,
    itemTypes: ${PR_ITEM_TYPES}) {
    ${PR_TIMELINE_ITEMS}
  }
  reviews(last: 50) {
    ${REVIEWS}
  }
}`

const ISSUE_EXPAND = `fragment IssueExpand on Issue {
  id number title url state createdAt body
  author { login __typename }
  timelineItems(since: $since, first: 100, itemTypes: ${ISSUE_ITEM_TYPES}) {
    ${ISSUE_TIMELINE_ITEMS}
  }
}`

const field = (kind: ExpandTarget['kind']) => (kind === 'pull_request' ? 'pullRequest' : 'issue')

/** 別名でまとめた問い合わせの文。使わない断片は入れない（GraphQL は使わない断片を断る） */
export function expandQuery(batch: readonly ExpandTarget[]): string {
  const variables = ['$since: DateTime!']
  const aliases: string[] = []
  batch.forEach((target, index) => {
    variables.push(`$o${index}: String!`, `$r${index}: String!`, `$n${index}: Int!`)
    const fragment = target.kind === 'pull_request' ? 'PrExpand' : 'IssueExpand'
    aliases.push(`  t${index}: repository(owner: $o${index}, name: $r${index}) {
    ${field(target.kind)}(number: $n${index}) { ...${fragment} }
  }`)
  })
  const fragments = [
    ...(batch.some((target) => target.kind === 'pull_request') ? [PR_EXPAND] : []),
    ...(batch.some((target) => target.kind === 'issue') ? [ISSUE_EXPAND] : []),
  ]
  return `query Expand(${variables.join(', ')}) {
  rateLimit { cost remaining resetAt }
${aliases.join('\n')}
}

${fragments.join('\n\n')}
`
}

const TIMELINE_PAGE_QUERY = {
  pull_request: `query ExpandPrTimeline($since: DateTime!, $o: String!, $r: String!, $n: Int!, $after: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $o, name: $r) {
    pullRequest(number: $n) {
      timelineItems(since: $since, first: 100, after: $after, itemTypes: ${PR_ITEM_TYPES}) {
        ${PR_TIMELINE_ITEMS}
      }
    }
  }
}
`,
  issue: `query ExpandIssueTimeline($since: DateTime!, $o: String!, $r: String!, $n: Int!, $after: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $o, name: $r) {
    issue(number: $n) {
      timelineItems(since: $since, first: 100, after: $after, itemTypes: ${ISSUE_ITEM_TYPES}) {
        ${ISSUE_TIMELINE_ITEMS}
      }
    }
  }
}
`,
} as const

const REVIEWS_PAGE_QUERY = `query ExpandPrReviews($o: String!, $r: String!, $n: Int!, $before: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $o, name: $r) {
    pullRequest(number: $n) {
      reviews(last: 50, before: $before) {
        ${REVIEWS}
      }
    }
  }
}
`

// ---- 応答の検査（core/github-shapes の形。使う項目だけ） ----

const AuthorSchema = z.object({ login: z.string(), __typename: z.string() }).nullable()
const ActorRefSchema = z.object({ __typename: z.string(), login: z.string().optional() }).nullable()
const IssueCommentSchema = z.object({
  __typename: z.literal('IssueComment'),
  id: z.string(),
  url: z.string(),
  createdAt: z.string(),
  body: z.string(),
  author: AuthorSchema,
})
const ReviewRequestedSchema = z.object({
  __typename: z.literal('ReviewRequestedEvent'),
  id: z.string(),
  createdAt: z.string(),
  actor: AuthorSchema,
  requestedReviewer: ActorRefSchema,
})
const AssignedSchema = z.object({
  __typename: z.literal('AssignedEvent'),
  id: z.string(),
  createdAt: z.string(),
  actor: AuthorSchema,
  assignee: ActorRefSchema,
})
const TimelinePageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
})
const PrTimelineSchema = z.object({
  pageInfo: TimelinePageInfoSchema,
  nodes: z.array(
    z.discriminatedUnion('__typename', [IssueCommentSchema, ReviewRequestedSchema, AssignedSchema]),
  ),
})
const IssueTimelineSchema = z.object({
  pageInfo: TimelinePageInfoSchema,
  nodes: z.array(z.discriminatedUnion('__typename', [IssueCommentSchema, AssignedSchema])),
})
const ReviewsSchema = z.object({
  pageInfo: z.object({ hasPreviousPage: z.boolean(), startCursor: z.string().nullable() }),
  nodes: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      state: z.string(),
      createdAt: z.string(),
      submittedAt: z.string().nullable(),
      body: z.string(),
      author: AuthorSchema,
      comments: z.object({
        nodes: z.array(
          z.object({
            url: z.string(),
            body: z.string(),
            replyTo: z.object({ id: z.string() }).nullable(),
          }),
        ),
      }),
    }),
  ),
})
const SubjectBaseSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  createdAt: z.string(),
  body: z.string(),
  author: AuthorSchema,
})
const PullRequestSchema = SubjectBaseSchema.extend({
  isDraft: z.boolean(),
  viewerLatestReview: z.object({ state: z.string() }).nullable(),
  timelineItems: PrTimelineSchema,
  reviews: ReviewsSchema,
})
const IssueSchema = SubjectBaseSchema.extend({ timelineItems: IssueTimelineSchema })

const GraphQLErrorSchema = z.object({
  type: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
})
const ResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullish(),
  errors: z.array(GraphQLErrorSchema).optional(),
})

type PullRequestNode = z.infer<typeof PullRequestSchema>
type IssueNode = z.infer<typeof IssueSchema>
type Parsed = { kind: 'pull_request'; node: PullRequestNode } | { kind: 'issue'; node: IssueNode }

/** 問い合わせそのものの失敗のうち、どれを優先して返すか（受け取りの状態の重さの順。component-frontend.md 5.） */
const FAILURE_ORDER: GitHubFailure['kind'][] = [
  'auth_failed',
  'rate_limited',
  'offline',
  'github_error',
  'not_accessible',
]

function worst(failures: GitHubFailure[]): GitHubFailure | undefined {
  return failures.toSorted(
    (a, b) => FAILURE_ORDER.indexOf(a.kind) - FAILURE_ORDER.indexOf(b.kind),
  )[0]
}

type Response =
  | { kind: 'ok'; data: Record<string, unknown>; erroredAliases: Map<string, string | undefined> }
  | { kind: 'failed'; failure: GitHubFailure }

const SECOND_MS = 1000

/** POST /graphql を送り、本文の data と、別名ごとの errors を取り出す */
async function send(
  client: GitHubClient,
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Response> {
  const result = await client.graphql({ endpoint, query, variables })
  if (result.kind === 'failed') return result
  if (result.kind === 'not_modified') {
    return { kind: 'failed', failure: { kind: 'github_error', status: 304 } }
  }
  const parsed = ResponseSchema.safeParse(result.body)
  if (!parsed.success) {
    return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
  }
  const errors = parsed.data.errors ?? []
  // 利用制限は 200 と errors で返ることがある。止める時刻はヘッダーで分かる
  if (errors.some((error) => error.type === 'RATE_LIMITED')) {
    const reset = Number(result.headers.get('x-ratelimit-reset') ?? Number.NaN)
    if (Number.isFinite(reset)) {
      return {
        kind: 'failed',
        failure: { kind: 'rate_limited', retryAt: new Date(reset * SECOND_MS) },
      }
    }
    return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
  }
  const data = parsed.data.data
  if (data === null || data === undefined) {
    return { kind: 'failed', failure: { kind: 'github_error', status: result.status } }
  }
  const erroredAliases = new Map<string, string | undefined>()
  for (const error of errors) {
    const [alias] = error.path ?? []
    if (typeof alias === 'string') erroredAliases.set(alias, error.type)
  }
  return { kind: 'ok', data, erroredAliases }
}

/** repository の下の pullRequest・issue を取り出す。無ければ null */
function innerOf(repository: unknown, kind: ExpandTarget['kind']): unknown {
  const parsed = z.record(z.string(), z.unknown()).safeParse(repository)
  return parsed.success ? (parsed.data[field(kind)] ?? null) : null
}

/** 別名1つ分の応答を検査する（別名の errors に入った・消えた・形が合わないは、そのスレッドだけの失敗） */
function parseSubject(
  response: Extract<Response, { kind: 'ok' }>,
  alias: string,
  kind: ExpandTarget['kind'],
): { kind: 'ok'; parsed: Parsed } | { kind: 'failed'; reason: SubjectFailureReason } {
  if (response.erroredAliases.has(alias)) {
    const type = response.erroredAliases.get(alias)
    if (type === 'NOT_FOUND') return { kind: 'failed', reason: 'not_found' }
    if (type === 'FORBIDDEN') return { kind: 'failed', reason: 'not_accessible' }
    return { kind: 'failed', reason: 'graphql_error' }
  }
  const node = innerOf(response.data[alias], kind)
  if (node === null) return { kind: 'failed', reason: 'not_found' }
  if (kind === 'pull_request') {
    const parsed = PullRequestSchema.safeParse(node)
    return parsed.success
      ? { kind: 'ok', parsed: { kind, node: parsed.data } }
      : { kind: 'failed', reason: 'invalid_shape' }
  }
  const parsed = IssueSchema.safeParse(node)
  return parsed.success
    ? { kind: 'ok', parsed: { kind, node: parsed.data } }
    : { kind: 'failed', reason: 'invalid_shape' }
}

type FollowUp =
  | { kind: 'ok'; parsed: Parsed }
  | { kind: 'thread_failed'; reason: SubjectFailureReason }
  | { kind: 'failed'; failure: GitHubFailure }

/** 続きの問い合わせ1回分。repository の下の pullRequest・issue を返す */
async function sendFollowUp(
  client: GitHubClient,
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  kind: ExpandTarget['kind'],
): Promise<{ kind: 'ok'; inner: unknown } | Exclude<FollowUp, { kind: 'ok' }>> {
  const response = await send(client, endpoint, query, variables)
  if (response.kind === 'failed') {
    // リポジトリに入れない（403・404）は、そのスレッドだけの失敗にする
    return response.failure.kind === 'not_accessible'
      ? { kind: 'thread_failed', reason: 'not_accessible' }
      : response
  }
  if (response.erroredAliases.size > 0) return { kind: 'thread_failed', reason: 'graphql_error' }
  return { kind: 'ok', inner: innerOf(response.data['repository'], kind) }
}

/** timelineItems の続き（hasNextPage が真の間、after でたどる。github-api.md 3.） */
async function followTimeline(
  client: GitHubClient,
  target: ExpandTarget,
  since: string,
  first: Parsed,
): Promise<FollowUp> {
  let current = first
  let after = nextCursor(current)
  while (after !== undefined) {
    const page = await sendFollowUp(
      client,
      'graphql.expand_timeline',
      TIMELINE_PAGE_QUERY[target.kind],
      { since, o: target.owner, r: target.name, n: target.number, after },
      target.kind,
    )
    if (page.kind !== 'ok') return page
    if (current.kind === 'pull_request') {
      const parsed = z.object({ timelineItems: PrTimelineSchema }).safeParse(page.inner)
      if (!parsed.success) return { kind: 'thread_failed', reason: 'invalid_shape' }
      const { pageInfo, nodes } = parsed.data.timelineItems
      const timelineItems = { pageInfo, nodes: [...current.node.timelineItems.nodes, ...nodes] }
      current = { kind: 'pull_request', node: { ...current.node, timelineItems } }
    } else {
      const parsed = z.object({ timelineItems: IssueTimelineSchema }).safeParse(page.inner)
      if (!parsed.success) return { kind: 'thread_failed', reason: 'invalid_shape' }
      const { pageInfo, nodes } = parsed.data.timelineItems
      const timelineItems = { pageInfo, nodes: [...current.node.timelineItems.nodes, ...nodes] }
      current = { kind: 'issue', node: { ...current.node, timelineItems } }
    }
    after = nextCursor(current)
  }
  return { kind: 'ok', parsed: current }
}

function nextCursor(parsed: Parsed): string | undefined {
  const { pageInfo } = parsed.node.timelineItems
  return pageInfo.hasNextPage && pageInfo.endCursor !== null ? pageInfo.endCursor : undefined
}

/** reviews の前のページの cursor。一番古いものがまだスレッドの since 以降で、hasPreviousPage が真のときだけ（CR-002） */
function previousCursor(node: PullRequestNode, since: string): string | undefined {
  const { pageInfo, nodes } = node.reviews
  const oldest = nodes[0]
  if (!pageInfo.hasPreviousPage || pageInfo.startCursor === null || oldest === undefined) {
    return undefined
  }
  const oldestAt = Date.parse(oldest.submittedAt ?? oldest.createdAt)
  return oldestAt >= Date.parse(since) ? pageInfo.startCursor : undefined
}

/** reviews の前のページを before でたどる */
async function followReviews(
  client: GitHubClient,
  target: ExpandTarget,
  first: PullRequestNode,
): Promise<FollowUp> {
  let current = first
  let before = previousCursor(current, target.since)
  while (before !== undefined) {
    const page = await sendFollowUp(
      client,
      'graphql.expand_reviews',
      REVIEWS_PAGE_QUERY,
      { o: target.owner, r: target.name, n: target.number, before },
      'pull_request',
    )
    if (page.kind !== 'ok') return page
    const parsed = z.object({ reviews: ReviewsSchema }).safeParse(page.inner)
    if (!parsed.success) return { kind: 'thread_failed', reason: 'invalid_shape' }
    const { pageInfo, nodes } = parsed.data.reviews
    current = { ...current, reviews: { pageInfo, nodes: [...nodes, ...current.reviews.nodes] } }
    before = previousCursor(current, target.since)
  }
  return { kind: 'ok', parsed: { kind: 'pull_request', node: current } }
}

/** 1スレッド分の続きをたどり、core に渡す形にする */
async function complete(
  client: GitHubClient,
  target: ExpandTarget,
  since: string,
  parsed: Parsed,
): Promise<FollowUp> {
  const timeline = await followTimeline(client, target, since, parsed)
  if (timeline.kind !== 'ok' || timeline.parsed.kind === 'issue') return timeline
  return followReviews(client, target, timeline.parsed.node)
}

function toSubject(parsed: Parsed): ExpandSubject {
  return parsed.kind === 'pull_request'
    ? { kind: 'pull_request', node: parsed.node }
    : { kind: 'issue', node: parsed.node }
}

/** まとめた1回分（20スレッドまで） */
async function fetchBatch(
  client: GitHubClient,
  batch: readonly ExpandTarget[],
): Promise<
  { kind: 'ok'; results: [string, SubjectResult][] } | { kind: 'failed'; failure: GitHubFailure }
> {
  // since の順に並べてあるので、先頭が一番古い（CR-009）
  const [oldest] = batch
  if (oldest === undefined) return { kind: 'ok', results: [] }
  const since = githubTimestamp(oldest.since)
  const variables: Record<string, unknown> = { since }
  batch.forEach((target, index) => {
    variables[`o${index}`] = target.owner
    variables[`r${index}`] = target.name
    variables[`n${index}`] = target.number
  })
  const response = await send(client, 'graphql.expand', expandQuery(batch), variables)
  if (response.kind === 'failed') {
    if (response.failure.kind !== 'not_accessible') return response
    // まとめた問い合わせ全体が 403 なら、入れたスレッドそれぞれの失敗にする
    return {
      kind: 'ok',
      results: batch.map((target) => [
        target.threadId,
        { kind: 'failed', reason: 'not_accessible' },
      ]),
    }
  }
  const outcomes = await Promise.all(
    batch.map(async (target, index): Promise<FollowUp> => {
      const first = parseSubject(response, `t${index}`, target.kind)
      if (first.kind === 'failed') return { kind: 'thread_failed', reason: first.reason }
      return complete(client, target, since, first.parsed)
    }),
  )
  const failure = worst(
    outcomes.flatMap((outcome) => (outcome.kind === 'failed' ? [outcome.failure] : [])),
  )
  if (failure !== undefined) return { kind: 'failed', failure }
  return {
    kind: 'ok',
    results: batch.map((target, index): [string, SubjectResult] => {
      const outcome = outcomes[index]
      if (outcome?.kind === 'ok')
        return [target.threadId, { kind: 'ok', subject: toSubject(outcome.parsed) }]
      return [
        target.threadId,
        {
          kind: 'failed',
          reason: outcome?.kind === 'thread_failed' ? outcome.reason : 'graphql_error',
        },
      ]
    }),
  }
}

/**
 * 分解の材料を取る。スレッドを since の順に並べ、20件ずつまとめて問い合わせる（同時に投げる数は rate-budget が4本に絞る）。
 * どれかの問い合わせそのものが失敗したら、全体を失敗にする（その回の取り込みをやり直す）
 */
export async function fetchExpandSubjects(
  client: GitHubClient,
  targets: readonly ExpandTarget[],
): Promise<ExpandResults> {
  const sorted = targets.toSorted((a, b) => Date.parse(a.since) - Date.parse(b.since))
  const batches: ExpandTarget[][] = []
  for (let start = 0; start < sorted.length; start += EXPAND_BATCH_SIZE) {
    batches.push(sorted.slice(start, start + EXPAND_BATCH_SIZE))
  }
  const outcomes = await Promise.all(batches.map((batch) => fetchBatch(client, batch)))
  const failure = worst(
    outcomes.flatMap((outcome) => (outcome.kind === 'failed' ? [outcome.failure] : [])),
  )
  if (failure !== undefined) return { kind: 'failed', failure }
  return {
    kind: 'ok',
    subjects: new Map(
      outcomes.flatMap((outcome) => (outcome.kind === 'ok' ? outcome.results : [])),
    ),
  }
}
