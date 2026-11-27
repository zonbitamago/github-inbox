// GitHub の実際の応答を、読み取りだけで記録する（test-conventions.md 3.、github-api.md 8.）。
// 生の応答には実データ（会社のリポジトリ名・本文など）が入るため、**リポジトリの外**にだけ書く。
// リポジトリに入れるのは anonymize.ts で架空のデータに置き換えたものだけ。
// 会話や文書に出してよいのは、件数・形・時間だけ（CLAUDE.md）。この道具の出力もそれに限る。
//
// 使い方:
//   node scripts/fixtures/record.ts survey <生の応答を置くフォルダ>
//     GitHub の通知・利用者・所属チーム・PR の検索3本を記録し、通知の PR・issue をまとめて分解して、形だけを出す
//   node scripts/fixtures/record.ts notifications <生の応答を置くフォルダ>
//     GitHub の通知と 304 だけを記録し直す
//   node scripts/fixtures/record.ts ci <生の応答を置くフォルダ> <owner/name>
//     そのリポジトリの GitHub の通知（ci_activity を含む）と、利用者が起動した完了済みのワークフロー実行を記録する（github-api.md 4.。R-05）
//   node scripts/fixtures/record.ts latest-comment <生の応答を置くフォルダ> <名前> <スレッドの番号>
//     GitHub の通知の subject.latest_comment_url を読み、<名前>.json に記録する（M-9 の出典。CR-004）
//   node scripts/fixtures/record.ts expand <生の応答を置くフォルダ> <名前> <since> <スレッドの番号（survey の出力の #）>...
//     選んだスレッドだけを分解し、<名前>.json に記録する
//   node scripts/fixtures/record.ts releases <生の応答を置くフォルダ>
//     配布用のリポジトリの最新の版（GET /repos/{owner}/{repo}/releases/latest。github-api.md 6.）を記録する
//
// GitHub への問い合わせは gh CLI に任せる（GET と GraphQL の query だけ。書き込みはしない。S-02）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../..')

/** 応答から残すヘッダー（github-api.md で使うものだけ） */
const KEPT_HEADERS = [
  'etag',
  'last-modified',
  'x-poll-interval',
  'link',
  'x-oauth-scopes',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-used',
  'x-ratelimit-resource',
]

interface Recorded {
  request: {
    method: 'GET' | 'POST'
    path: string
    headers?: Record<string, string>
    body?: unknown
  }
  response: { status: number; headers: Record<string, string>; body: unknown }
}

/** gh の出力の上限。分解の応答は 1MB を超えることがある（Node.js の既定は 1MB で、超えると途中で切れる） */
const MAX_BUFFER = 256 * 1024 * 1024

/** 応答の JSON を読む。失敗しても、中身（実データ）を出さないように位置と長さだけを伝える */
function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new SafeError(`${what} の JSON を読めなかった（長さ ${text.length}）`)
  }
}

/** 出力してよい文言だけを持つエラー（実データを含めない） */
class SafeError extends Error {}

function outDirFrom(arg: string | undefined): string {
  if (arg === undefined) {
    throw new SafeError('生の応答を置くフォルダを指定する')
  }
  const dir = resolve(arg)
  if (dir === REPO_ROOT || dir.startsWith(`${REPO_ROOT}/`)) {
    throw new SafeError('生の応答はリポジトリの外に置く（test-conventions.md 3.）')
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

function parseHttp(raw: string): { status: number; headers: Record<string, string>; text: string } {
  const separator = raw.search(/\r?\n\r?\n/)
  const head = separator === -1 ? raw : raw.slice(0, separator)
  const text = separator === -1 ? '' : raw.slice(separator).trim()
  const [statusLine = '', ...headerLines] = head.split(/\r?\n/)
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(statusLine)?.[1] ?? 'NaN')
  const headers: Record<string, string> = {}
  for (const line of headerLines) {
    const index = line.indexOf(':')
    const name = line.slice(0, index).trim().toLowerCase()
    if (KEPT_HEADERS.includes(name)) {
      headers[name] = line.slice(index + 1).trim()
    }
  }
  return { status, headers, text }
}

function ghGet(path: string, requestHeaders: Record<string, string> = {}): Recorded {
  const args = ['api', '-i', '--method', 'GET', path]
  for (const [name, value] of Object.entries(requestHeaders)) {
    args.push('-H', `${name}: ${value}`)
  }
  let raw: string
  try {
    raw = execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_BUFFER,
    })
  } catch (error) {
    // 304 などで gh が 0 以外で終わっても、応答そのものは標準出力にある
    const stdout = (error as { stdout?: string }).stdout
    if (stdout === undefined || stdout === '') {
      throw new SafeError(`gh api が応答を返さなかった（GET ${path.split('?')[0] ?? ''}）`)
    }
    raw = stdout
  }
  const { status, headers, text } = parseHttp(raw)
  return {
    request: {
      method: 'GET',
      path,
      ...(Object.keys(requestHeaders).length > 0 ? { headers: requestHeaders } : {}),
    },
    response: {
      status,
      headers,
      body: text === '' ? null : parseJson(text, `GET ${path.split('?')[0] ?? ''}`),
    },
  }
}

function ghGraphql(query: string, variables: Record<string, unknown>): Recorded {
  const body = { query, variables }
  let raw: string
  try {
    raw = execFileSync('gh', ['api', '-i', 'graphql', '--input', '-'], {
      encoding: 'utf-8',
      input: JSON.stringify(body),
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: MAX_BUFFER,
    })
  } catch (error) {
    // GraphQL の errors でも gh は 0 以外で終わる。応答は標準出力にある。
    // エラーの文言にはリポジトリ名などが入りうるため、ここでは投げ直さず、出力もしない
    const stdout = (error as { stdout?: string }).stdout
    if (stdout === undefined || stdout === '') {
      throw new SafeError('gh api graphql が応答を返さなかった')
    }
    raw = stdout
  }
  const { status, headers, text } = parseHttp(raw)
  return {
    request: { method: 'POST', path: '/graphql', body },
    response: { status, headers, body: parseJson(text, 'POST /graphql') },
  }
}

function save(dir: string, name: string, recorded: Recorded): void {
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(recorded, null, 2)}\n`)
}

// ---- 問い合わせの文（github-api.md 3.・5. と同じ形） ----

const ISSUE_COMMENT_NODE = `
      ... on IssueComment { id url createdAt body author { login __typename } }`
const ASSIGNED_EVENT_NODE = `
      ... on AssignedEvent {
        id createdAt actor { login __typename }
        assignee { __typename ... on User { login } }
      }`
const REVIEW_REQUESTED_EVENT_NODE = `
      ... on ReviewRequestedEvent {
        id createdAt actor { login __typename }
        requestedReviewer { __typename ... on User { login } }
      }`

// レビューは timelineItems ではなく reviews の一覧で取る。timelineItems にはレビューのスレッドへの
// 返信（本文が空で、返信1件だけのレビュー）が出てこないため（⑬ B2 で分かった。CR-002）。
// issue の timelineItems には、レビューとレビュー依頼の型を含められない（CR-001）。
const PR_EXPAND = `fragment PrExpand on PullRequest {
  id number title url state isDraft createdAt body
  author { login __typename }
  viewerLatestReview { state }
  timelineItems(since: $since, first: 100,
    itemTypes: [ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, ASSIGNED_EVENT]) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename${ISSUE_COMMENT_NODE}${REVIEW_REQUESTED_EVENT_NODE}${ASSIGNED_EVENT_NODE}
    }
  }
  reviews(last: 50) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      id url state createdAt submittedAt body author { login __typename }
      comments(first: 20) { nodes { url body replyTo { id } } }
    }
  }
}`

const ISSUE_EXPAND = `fragment IssueExpand on Issue {
  id number title url state createdAt body
  author { login __typename }
  timelineItems(since: $since, first: 100, itemTypes: [ISSUE_COMMENT, ASSIGNED_EVENT]) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename${ISSUE_COMMENT_NODE}${ASSIGNED_EVENT_NODE}
    }
  }
}`

interface Subject {
  owner: string
  name: string
  number: number
  kind: 'pull' | 'issue'
}

function expandQuery(subjects: Subject[]): { query: string; variables: Record<string, unknown> } {
  const params = ['$since: DateTime!']
  const fields = ['  rateLimit { cost remaining resetAt }']
  const variables: Record<string, unknown> = {}
  subjects.forEach((subject, index) => {
    params.push(`$o${index}: String!`, `$r${index}: String!`, `$n${index}: Int!`)
    const inner =
      subject.kind === 'pull'
        ? `pullRequest(number: $n${index}) { ...PrExpand }`
        : `issue(number: $n${index}) { ...IssueExpand }`
    fields.push(`  t${index}: repository(owner: $o${index}, name: $r${index}) {\n    ${inner}\n  }`)
    variables[`o${index}`] = subject.owner
    variables[`r${index}`] = subject.name
    variables[`n${index}`] = subject.number
  })
  const fragments = [
    subjects.some((subject) => subject.kind === 'pull') ? PR_EXPAND : '',
    subjects.some((subject) => subject.kind === 'issue') ? ISSUE_EXPAND : '',
  ].filter((text) => text !== '')
  return {
    query: `query Expand(${params.join(', ')}) {\n${fields.join('\n')}\n}\n\n${fragments.join('\n\n')}\n`,
    variables,
  }
}

const PR_LIST_FIELDS = `id number title url state isDraft updatedAt author { login __typename } repository { nameWithOwner } assignees(first: 10) { nodes { login } }`
const PR_STATUS_FIELDS = `id reviewDecision latestOpinionatedReviews(first: 20, writersOnly: true) { nodes { state } } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`

function searchQuery(fields: string): string {
  return `query Search($q: String!) {
  search(query: $q, type: ISSUE, first: 100) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${fields} } }
  }
}
`
}

// ---- survey ----

/**
 * GitHub の通知と、変わっていないときの 304 を記録する。
 * 304 は If-None-Match（ETag）で返る。If-Modified-Since では 200 が返った（⑬ B2 で確かめた。CR-003）
 */
function recordGithubNotifications(dir: string): Recorded {
  const path = '/notifications?all=true&per_page=50'
  const githubNotifications = ghGet(path)
  save(dir, 'notifications', githubNotifications)
  const etag = githubNotifications.response.headers['etag']
  if (etag !== undefined) {
    const notModified = ghGet(path, { 'If-None-Match': etag })
    save(dir, 'notifications-not-modified', notModified)
    console.log(`304 の確認: status ${notModified.response.status}`)
  }
  return githubNotifications
}

interface GithubNotificationThread {
  id: string
  reason: string
  updated_at: string
  subject: { type: string; url: string | null; latest_comment_url: string | null }
  repository: { full_name: string }
}

function subjectOf(thread: GithubNotificationThread): Subject | null {
  const match = /\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)$/.exec(thread.subject.url ?? '')
  if (match === null) {
    return null
  }
  return {
    owner: match[1] ?? '',
    name: match[2] ?? '',
    number: Number(match[4]),
    kind: match[3] === 'pulls' ? 'pull' : 'issue',
  }
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const name = key(item)
    counts[name] = (counts[name] ?? 0) + 1
  }
  return counts
}

interface TimelineNode {
  __typename: string
  createdAt?: string
  submittedAt?: string | null
  state?: string
  body?: string
  author?: { login: string; __typename: string } | null
  actor?: { login: string; __typename: string } | null
  comments?: { nodes: { body: string; replyTo: { id: string } | null }[] }
  requestedReviewer?: { __typename: string; login?: string } | null
  assignee?: { __typename: string; login?: string } | null
}

interface Expanded {
  number: number
  state: string
  isDraft?: boolean
  body: string
  author: { login: string; __typename: string } | null
  viewerLatestReview?: { state: string } | null
  timelineItems: { pageInfo: { hasNextPage: boolean }; nodes: TimelineNode[] }
  reviews?: { pageInfo: { hasPreviousPage: boolean }; nodes: TimelineNode[] }
}

function survey(dir: string): void {
  const viewerRecord = ghGet('/user')
  save(dir, 'user', viewerRecord)
  const viewer = (viewerRecord.response.body as { login: string }).login
  const teams = ghGet('/user/teams?per_page=100')
  save(dir, 'user-teams', teams)

  const githubNotifications = recordGithubNotifications(dir)
  const lastModified = githubNotifications.response.headers['etag']

  const now = Date.now()
  const boundary = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  save(
    dir,
    'search-a',
    ghGraphql(searchQuery(PR_LIST_FIELDS), { q: `is:pr involves:@me updated:>${boundary}` }),
  )
  save(
    dir,
    'search-b',
    ghGraphql(searchQuery(PR_LIST_FIELDS), {
      q: `is:pr review-requested:@me updated:>${boundary}`,
    }),
  )
  save(
    dir,
    'search-c',
    ghGraphql(searchQuery(PR_STATUS_FIELDS), {
      q: `is:pr is:open author:@me updated:>${boundary}`,
    }),
  )

  const threads = githubNotifications.response.body as GithubNotificationThread[]
  const seen = new Set<string>()
  const subjects: { index: number; subject: Subject; thread: GithubNotificationThread }[] = []
  threads.forEach((thread, index) => {
    const subject = subjectOf(thread)
    if (subject === null) return
    const key = `${subject.owner}/${subject.name}#${subject.number}`
    if (seen.has(key)) return
    seen.add(key)
    subjects.push({ index, subject, thread })
  })

  // 30日分を分解して、場面ごとの形を数える（中身は出さない）
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const rows: string[] = []
  for (let start = 0; start < subjects.length; start += 20) {
    const batch = subjects.slice(start, start + 20)
    const { query, variables } = expandQuery(batch.map((item) => item.subject))
    const recorded = ghGraphql(query, { since, ...variables })
    save(dir, `survey-expand-${start / 20}`, recorded)
    const data = recorded.response.body as {
      data?: Record<string, { pullRequest?: Expanded; issue?: Expanded } | { cost: number } | null>
      errors?: unknown[]
    }
    const rateLimit = data.data?.['rateLimit'] as { cost: number } | undefined
    rows.push(
      `  (バッチ ${start / 20}: ${batch.length} スレッド、利用制限の消費 ${rateLimit?.cost ?? '?'})`,
    )
    if (data.errors !== undefined) {
      // 文言は出さず、種類だけを出す
      const kinds = countBy(
        data.errors as { type?: string; extensions?: { code?: string } }[],
        (e) => e.type ?? e.extensions?.code ?? '?',
      )
      rows.push(`  (バッチ ${start / 20}: errors ${JSON.stringify(kinds)})`)
    }
    batch.forEach((item, offset) => {
      const node = data.data?.[`t${offset}`] as
        { pullRequest?: Expanded; issue?: Expanded } | null | undefined
      const expanded = node?.pullRequest ?? node?.issue
      if (expanded === undefined) {
        rows.push(`#${item.index} ${item.subject.kind} reason=${item.thread.reason} → 取れなかった`)
        return
      }
      // レビューは reviews の一覧から、提出した時刻が since 以降のものだけ（CR-002）
      const reviews = (expanded.reviews?.nodes ?? [])
        .filter((n) => (n.submittedAt ?? '') >= since)
        .map((n) => ({ ...n, __typename: 'PullRequestReview' }))
      const nodes = [...expanded.timelineItems.nodes, ...reviews]
      const byViewer = (login: string | undefined) => login?.toLowerCase() === viewer.toLowerCase()
      const mentionsViewer = (text: string | undefined) =>
        new RegExp(`(^|[^A-Za-z0-9/-])@${viewer}(?![A-Za-z0-9/-])`, 'i').test(text ?? '')
      const replyOnly = nodes.filter(
        (n) =>
          n.__typename === 'PullRequestReview' &&
          (n.body ?? '') === '' &&
          n.comments?.nodes.length === 1 &&
          n.comments.nodes[0]?.replyTo !== null,
      ).length
      const lateSubmit = nodes.filter(
        (n) =>
          n.__typename === 'PullRequestReview' &&
          n.createdAt !== undefined &&
          n.createdAt < since &&
          (n.submittedAt ?? '') >= since,
      ).length
      const flags = [
        `own=${byViewer(expanded.author?.login)}`,
        `state=${expanded.state}${expanded.isDraft === true ? '(draft)' : ''}`,
        `types=${JSON.stringify(countBy(nodes, (n) => n.__typename))}`,
        `reviewStates=${JSON.stringify(
          countBy(
            nodes.filter((n) => n.__typename === 'PullRequestReview'),
            (n) => n.state ?? '?',
          ),
        )}`,
        `replyOnly=${replyOnly}`,
        `teamRequest=${nodes.filter((n) => n.requestedReviewer?.__typename === 'Team').length}`,
        `requestToViewer=${nodes.filter((n) => n.__typename === 'ReviewRequestedEvent' && byViewer(n.requestedReviewer?.login)).length}`,
        `assignViewer=${nodes.filter((n) => n.__typename === 'AssignedEvent' && byViewer(n.assignee?.login)).length}`,
        `bot=${nodes.filter((n) => (n.author ?? n.actor)?.__typename === 'Bot').length}`,
        `byViewer=${nodes.filter((n) => byViewer((n.author ?? n.actor)?.login)).length}`,
        `mention=${nodes.filter((n) => mentionsViewer(n.body) || (n.comments?.nodes ?? []).some((c) => mentionsViewer(c.body))).length}${mentionsViewer(expanded.body) ? '+body' : ''}`,
        `teamMentionLike=${nodes.filter((n) => /(^|\s)@[A-Za-z0-9-]+\/[A-Za-z0-9_-]+/.test(n.body ?? '')).length}`,
        `viewerReviewed=${expanded.viewerLatestReview?.state ?? 'none'}`,
        `lateSubmit=${lateSubmit}`,
        `more=${expanded.timelineItems.pageInfo.hasNextPage}/${expanded.reviews?.pageInfo.hasPreviousPage ?? '-'}`,
      ]
      rows.push(
        `#${item.index} ${item.subject.kind} reason=${item.thread.reason} ${flags.join(' ')}`,
      )
    })
  }

  const searchCount = (name: string) => {
    const body = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf-8')) as Recorded
    const search = (body.response.body as { data?: { search: { issueCount: number } } }).data
      ?.search
    return search?.issueCount ?? 'error'
  }
  console.log(`GitHub の通知: ${threads.length} 件`)
  console.log(`  理由: ${JSON.stringify(countBy(threads, (t) => t.reason))}`)
  console.log(`  種類: ${JSON.stringify(countBy(threads, (t) => t.subject.type))}`)
  console.log(
    `  latest_comment_url が空: ${threads.filter((t) => t.subject.latest_comment_url === null).length} 件`,
  )
  console.log(`  304 の確認: ${lastModified === undefined ? 'ETag なし' : 'あり'}`)
  console.log(
    `所属チーム: status ${teams.response.status}、${Array.isArray(teams.response.body) ? teams.response.body.length : '配列でない'} 件`,
  )
  console.log(
    `検索 A: ${searchCount('search-a')} 件、B: ${searchCount('search-b')} 件、C: ${searchCount('search-c')} 件`,
  )
  console.log(`分解したスレッド: ${subjects.length} 件（since は30日前）`)
  for (const row of rows) console.log(row)
  writeFileSync(
    join(dir, 'survey-meta.json'),
    `${JSON.stringify({ viewer, since, subjects }, null, 2)}\n`,
  )
}

// ---- expand（選んだスレッドだけ） ----

function expand(
  dir: string,
  name: string | undefined,
  since: string | undefined,
  indexes: string[],
): void {
  if (name === undefined || since === undefined || indexes.length === 0) {
    throw new SafeError('名前・since・スレッドの番号を指定する')
  }
  const metaPath = join(dir, 'survey-meta.json')
  if (!existsSync(metaPath)) {
    throw new SafeError('先に survey を動かす')
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
    subjects: { index: number; subject: Subject }[]
  }
  const subjects = indexes.map((index) => {
    const found = meta.subjects.find((item) => item.index === Number(index))
    if (found === undefined) throw new SafeError(`#${index} は分解したスレッドに無い`)
    return found.subject
  })
  const { query, variables } = expandQuery(subjects)
  const recorded = ghGraphql(query, { since, ...variables })
  save(dir, name, recorded)
  const body = recorded.response.body as { errors?: unknown[] }
  console.log(`${name}: status ${recorded.response.status}、errors ${body.errors?.length ?? 0} 件`)
}

// ---- ci（CI の結果。github-api.md 4.、R-05） ----

function recordCi(dir: string, repository: string | undefined): void {
  if (repository === undefined || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new SafeError('owner/name を指定する')
  }
  const viewerRecord = ghGet('/user')
  save(dir, 'user', viewerRecord)
  const viewer = (viewerRecord.response.body as { login: string }).login
  const githubNotifications = ghGet(`/repos/${repository}/notifications?all=true&per_page=50`)
  save(dir, 'ci-notifications', githubNotifications)
  const threads = githubNotifications.response.body as GithubNotificationThread[]
  const ci = threads.filter((thread) => thread.reason === 'ci_activity')
  // 作られた日付で絞るのは since の前の日から（github-api.md 4.。DR-09）
  const since = ci.map((thread) => thread.updated_at).sort()[0] ?? new Date().toISOString()
  const from = new Date(Date.parse(since) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const runs = ghGet(
    `/repos/${repository}/actions/runs?actor=${viewer}&status=completed&created=%3E%3D${from}&per_page=100`,
  )
  save(dir, 'ci-workflow-runs', runs)
  const body = runs.response.body as {
    total_count: number
    workflow_runs: { run_attempt: number; conclusion: string | null }[]
  }
  console.log(
    `GitHub の通知: ${threads.length} 件（ci_activity ${ci.length} 件。種類 ${JSON.stringify(countBy(ci, (t) => t.subject.type))}、subject.url が空 ${ci.filter((t) => t.subject.url === null).length} 件）`,
  )
  console.log(
    `ワークフロー実行: ${body.workflow_runs.length} 件（結果 ${JSON.stringify(countBy(body.workflow_runs, (r) => r.conclusion ?? 'null'))}、やり直し ${body.workflow_runs.filter((r) => r.run_attempt > 1).length} 件）`,
  )
  writeFileSync(
    join(dir, 'survey-meta.json'),
    `${JSON.stringify({ viewer, since: `${from}T00:00:00Z`, subjects: [] }, null, 2)}\n`,
  )
}

// ---- latest-comment（M-9 の出典。CR-004） ----

function latestComment(dir: string, name: string | undefined, index: string | undefined): void {
  if (name === undefined || index === undefined) {
    throw new SafeError('名前とスレッドの番号を指定する')
  }
  const meta = JSON.parse(readFileSync(join(dir, 'survey-meta.json'), 'utf-8')) as {
    subjects: { index: number; subject: Subject }[]
  }
  const found = meta.subjects.find((item) => item.index === Number(index))
  if (found === undefined) throw new SafeError(`#${index} は分解したスレッドに無い`)
  const threads = (JSON.parse(readFileSync(join(dir, 'notifications.json'), 'utf-8')) as Recorded)
    .response.body as GithubNotificationThread[]
  const thread = threads.find((item) => {
    const subject = subjectOf(item)
    return (
      subject !== null &&
      subject.owner === found.subject.owner &&
      subject.name === found.subject.name &&
      subject.number === found.subject.number
    )
  })
  const url = thread?.subject.latest_comment_url
  if (url === undefined || url === null) {
    console.log(`#${index}: latest_comment_url が空（記録しない）`)
    return
  }
  const recorded = ghGet(url.replace('https://api.github.com', ''))
  save(dir, name, recorded)
  const kind = /\/(issues\/comments|pulls\/comments|pulls|issues)\/\d+$/.exec(url)?.[1] ?? '?'
  console.log(`${name}: status ${recorded.response.status}、指す先 ${kind}`)
}

// ---- releases（新しい版。github-api.md 6.、F-31） ----

/** 配布用のリポジトリ（build-and-release.md 1.）。公開しているアプリそのものの名前で、実データではない */
const RELEASES_REPOSITORY = 'zonbitamago/github-inbox'

function recordReleases(dir: string): void {
  const recorded = ghGet(`/repos/${RELEASES_REPOSITORY}/releases/latest`)
  save(dir, 'releases-latest', recorded)
  console.log(`releases-latest: status ${recorded.response.status}`)
}

function main(): void {
  const [command, dirArg, ...rest] = process.argv.slice(2)
  const dir = outDirFrom(dirArg)
  if (command === 'survey') {
    survey(dir)
  } else if (command === 'notifications') {
    recordGithubNotifications(dir)
  } else if (command === 'expand') {
    expand(dir, rest[0], rest[1], rest.slice(2))
  } else if (command === 'ci') {
    recordCi(dir, rest[0])
  } else if (command === 'latest-comment') {
    latestComment(dir, rest[0], rest[1])
  } else if (command === 'releases') {
    recordReleases(dir)
  } else {
    throw new SafeError('survey か expand を指定する')
  }
}

try {
  main()
} catch (error) {
  // 実データを含みうるため、SafeError 以外は文言もスタックも出さない
  console.error(
    error instanceof SafeError
      ? error.message
      : `失敗した（${error instanceof Error ? error.name : typeof error}）。中身は出さない`,
  )
  process.exitCode = 1
}
