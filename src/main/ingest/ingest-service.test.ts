import { describe, expect, it, vi } from 'vitest'
import ciThreads from '../../../test/fixtures/github/notifications-repo-ci-activity.json'
import latestIssueComment from '../../../test/fixtures/github/rest-latest-comment-issue-comment.json'
import workflowRuns from '../../../test/fixtures/github/rest-workflow-runs.json'
import recordedTeams from '../../../test/fixtures/github/user-teams.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import { createFakeTimer } from '../../../test/support/fake-timer'
import {
  VIEWER,
  recordedExpandResponse,
  recordedExpandedGitHubNotifications,
  recordedGitHubNotificationHeaders,
} from '../../../test/support/github-fixtures'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { GitHubEventSchema, type GitHubEvent } from '../../shared/domain'
import type { AppState } from '../../shared/ipc-contract'
import type { GetRequest, GitHubResult, GraphQLRequest } from '../github/client'
import { RateBudget } from '../github/rate-budget'
import type { EventsChange, GitHubNotificationCursor, ThreadRecord } from '../store/events-store'
import { IngestService, type IngestStorePort } from './ingest-service'

const NOW = new Date('2026-01-31T00:00:00Z')
const NOW_ISO = NOW.toISOString()
/** 記録した分解の応答の since（2026-01-01）と揃えるため、出来事の一覧の日数を30日にする */
const EVENT_DAYS = 30
const HEADERS = recordedGitHubNotificationHeaders()
const ETAG = HEADERS['etag']
const MENTION_THREAD = '31545837801'
const ASSIGN_THREAD = '49230809513'

/** 出来事の記録の偽物（メモリに持つ。I-1 の重ね方は本物と同じ） */
function memoryStore() {
  let cursor: GitHubNotificationCursor = {}
  const threads = new Map<string, ThreadRecord>()
  const events: GitHubEvent[] = []
  const commits: EventsChange[] = []
  let failCommit = false
  const store: IngestStorePort = {
    githubNotificationCursor: () => ({ ...cursor }),
    thread: (id) => threads.get(id),
    commit(change) {
      if (failCommit) return Promise.reject(new Error('disk full'))
      commits.push(change)
      const known = new Set(events.map((event) => event.id))
      const added = (change.events ?? []).filter((event) => !known.has(event.id))
      events.push(...added)
      cursor = { ...cursor, ...change.githubNotifications }
      for (const [id, record] of Object.entries(change.threads ?? {})) {
        if (record === null) threads.delete(id)
        else threads.set(id, record)
      }
      return Promise.resolve(added)
    },
    listForDisplay: () => events.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  }
  return {
    store,
    commits,
    events,
    threads,
    failNextCommits: () => {
      failCommit = true
    },
  }
}

type GetAnswer = (request: GetRequest) => GitHubResult | undefined
type GraphQLAnswer = (request: GraphQLRequest) => GitHubResult | undefined

/** 記録した応答で答える GitHub。answers で一部だけ差し替える（差し替えが undefined を返したら記録した応答） */
function recordedGitHub(answers: { get?: GetAnswer; graphql?: GraphQLAnswer } = {}) {
  return createFakeGitHubClient({
    get(request) {
      const answered = answers.get?.(request)
      if (answered !== undefined) return answered
      if (request.path.startsWith('/user/teams')) return okResult(recordedTeams.response.body)
      if (request.path.startsWith('/notifications?')) {
        return okResult(recordedExpandedGitHubNotifications(), HEADERS)
      }
      if (request.path === latestIssueComment.request.path) {
        return okResult(latestIssueComment.response.body)
      }
      if (request.path.startsWith('/repos/alice/tools/actions/runs?')) {
        return okResult(workflowRuns.response.body, workflowRuns.response.headers)
      }
      throw new Error(`想定外の GET ${request.path}`)
    },
    graphql(request) {
      const answered = answers.graphql?.(request)
      if (answered !== undefined) return answered
      if (request.query.startsWith('query Expand(')) {
        return okResult(recordedExpandResponse(request.variables))
      }
      throw new Error('想定外の GraphQL')
    },
  })
}

function setup(answers: { get?: GetAnswer; graphql?: GraphQLAnswer } = {}) {
  const client = recordedGitHub(answers)
  const memory = memoryStore()
  const timer = createFakeTimer()
  const logger = createMemoryLogger()
  const clock = { now: NOW }
  const published: AppState['ingest'][] = []
  const added: GitHubEvent[][] = []
  const resets: GitHubEvent[][] = []
  let authFailures = 0
  const rateBudget = new RateBudget()
  const service = new IngestService({
    client,
    store: memory.store,
    storeLoaded: Promise.resolve(),
    eventDays: () => EVENT_DAYS,
    rateBudget,
    timer,
    now: () => clock.now,
    logger,
    publish: (view) => published.push(view),
    added: (events) => added.push(events),
    reset: (events) => resets.push(events),
    authFailed: () => {
      authFailures += 1
    },
  })
  /** 1回分が終わって、次の予約が入るまで待つ */
  const cycleDone = (count = 1) => vi.waitFor(() => expect(timer.pending()).toBe(count))
  return {
    service,
    client,
    ...memory,
    timer,
    logger,
    clock,
    published,
    added,
    resets,
    rateBudget,
    authFailures: () => authFailures,
    cycleDone,
    githubNotificationRequests: () =>
      client.gets.filter((get) => get.path.startsWith('/notifications?')),
  }
}

/** 記録した分解の応答の、番号が number の別名を「見つからない」にする（書き換えた応答） */
function notFoundFor(number: number): GraphQLAnswer {
  return (request) => {
    if (!request.query.startsWith('query Expand(')) return undefined
    const response = recordedExpandResponse(request.variables)
    const errors: unknown[] = []
    for (let index = 0; `n${index}` in request.variables; index += 1) {
      if (request.variables[`n${index}`] !== number) continue
      response.data[`t${index}`] = null
      errors.push({ type: 'NOT_FOUND', path: [`t${index}`] })
    }
    return okResult({ ...response, errors })
  }
}

/** 記録した分解の応答の、番号が number の PR から @alice を消す（M-9 に当たるようにする。書き換えた応答） */
function withoutViewerMention(number: number): GraphQLAnswer {
  return (request) => {
    if (!request.query.startsWith('query Expand(')) return undefined
    const response = recordedExpandResponse(request.variables)
    for (let index = 0; `n${index}` in request.variables; index += 1) {
      if (request.variables[`n${index}`] !== number) continue
      const text = JSON.stringify(response.data[`t${index}`])
      response.data[`t${index}`] = JSON.parse(text.replaceAll('@alice', '@nobody'))
    }
    return okResult(response)
  }
}

describe('立ち上げ時の取り戻し（component-backend.md 5.1、F-06）', () => {
  it('取り込み中を知らせ、GitHub の通知を since・per_page で問い合わせ、分解して保存し、一覧の全体を送る', async () => {
    const context = setup()
    context.service.start(VIEWER)
    expect(context.published[0]).toEqual({ state: 'syncing' })
    await context.cycleDone()

    const [first] = context.githubNotificationRequests()
    expect(first?.path).toBe('/notifications?all=true&since=2026-01-01T00%3A00%3A00Z&per_page=50')
    // 初回は ETag が無いので If-None-Match を付けない
    expect(first?.headers).toEqual({})
    // 6スレッドは20件以内なので、まとめた問い合わせ1回
    expect(context.client.queries).toHaveLength(1)

    expect(context.commits).toHaveLength(1)
    const [commit] = context.commits
    expect(commit?.githubNotifications).toEqual({ lastSuccessAt: NOW_ISO, etag: ETAG })
    expect(Object.keys(commit?.threads ?? {}).toSorted()).toEqual(
      recordedExpandedGitHubNotifications()
        .map((thread) => (thread as { id: string }).id)
        .toSorted(),
    )
    expect(Object.values(commit?.threads ?? {})).toEqual(
      Array(6).fill(expect.objectContaining({ expandedUntil: NOW_ISO, consecutiveFailures: 0 })),
    )
  })

  it('保存した出来事は GitHubEvent の形で、利用者自身の操作は無い（I-2・I-3）。id は重ならない（I-1）', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()

    expect(context.events.length).toBeGreaterThan(0)
    for (const event of context.events) {
      expect(GitHubEventSchema.safeParse(event).success).toBe(true)
      expect(event.actor.login).not.toBe(VIEWER)
      expect(event.receivedAt).toBe(NOW_ISO)
    }
    expect(new Set(context.events.map((event) => event.id)).size).toBe(context.events.length)
    expect(new Set(context.events.map((event) => event.type))).toEqual(
      new Set(['review_requested', 'assign', 'mention', 'comment', 'review', 'participating']),
    )
  })

  it('取り戻しの出来事は足す知らせ（デスクトップ通知の材料）に出さず、終わりに一覧の全体を送る（DN-1）', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.added).toEqual([])
    expect(context.resets).toEqual([context.store.listForDisplay(EVENT_DAYS, NOW)])
    expect(context.published.at(-1)).toEqual({ state: 'ok', lastSuccessAt: NOW_ISO })
  })

  it('所属チームを読み、次は X-Poll-Interval（60秒）後に問い合わせる', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.client.gets[0]).toEqual({
      endpoint: 'user_teams',
      path: '/user/teams?per_page=100',
    })
    expect(context.timer.pendingDelay()).toBe(60_000)
  })
})

describe('定期の取り込み（component-backend.md 5.2）', () => {
  it('2回目からは前回の ETag を If-None-Match に付け、304 なら保存しない', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/notifications?') && request.headers?.['If-None-Match'] === ETAG
          ? notModifiedResult(HEADERS)
          : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    context.timer.runNext()
    await context.cycleDone()

    expect(context.githubNotificationRequests().at(-1)?.headers).toEqual({ 'If-None-Match': ETAG })
    expect(context.commits).toHaveLength(1)
    expect(context.published.at(-1)).toEqual({ state: 'ok', lastSuccessAt: NOW_ISO })
  })

  it('定期の取り込みで増えた出来事を知らせる（足す知らせ。一覧の全体は送り直さない）', async () => {
    let first = true
    const context = setup({
      // 立ち上げ時は変わっていなかったことにする（書き換えた応答）
      get: (request) => {
        if (!request.path.startsWith('/notifications?') || !first) return undefined
        first = false
        return notModifiedResult(HEADERS)
      },
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.resets).toEqual([[]])
    context.timer.runNext()
    await context.cycleDone()

    expect(context.added).toHaveLength(1)
    expect(context.added[0]?.map((event) => event.id).toSorted()).toEqual(
      context.events.map((event) => event.id).toSorted(),
    )
    expect(context.resets).toHaveLength(1)
  })

  it('同じスレッドは、更新されるまで分解し直さない（domain-model.md 5.）', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    context.timer.runNext()
    await context.cycleDone()
    expect(context.client.queries).toHaveLength(1)
    expect(context.commits.at(-1)?.events).toEqual([])
  })

  it('X-Poll-Interval が長ければ、その間隔にする（github-api.md 2.。書き換えた応答）', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/notifications?')
          ? okResult([], { ...HEADERS, 'x-poll-interval': '120' })
          : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.timer.pendingDelay()).toBe(120_000)
  })

  it('スリープから戻ったら、待たずにすぐ1回問い合わせる（component-backend.md 6.1）', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    context.service.wake()
    await vi.waitFor(() => expect(context.githubNotificationRequests()).toHaveLength(2))
    await context.cycleDone()
    expect(context.timer.scheduled.filter((entry) => entry.cancelled)).toHaveLength(1)
  })

  it('取り込みの途中でスリープから戻っても、重ねて問い合わせない', async () => {
    const context = setup()
    context.service.start(VIEWER)
    context.service.wake()
    await context.cycleDone()
    expect(context.githubNotificationRequests()).toHaveLength(1)
  })
})

describe('失敗したとき（component-backend.md 6.1・6.3）', () => {
  it('つながらなければ、1回目は取り込み中のまま、2回目で offline にする。60秒ごとにやり直す', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/notifications?') ? failedResult({ kind: 'offline' }) : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.published.at(-1)).toEqual({ state: 'syncing' })
    expect(context.timer.runNext()).toBe(60_000)
    await context.cycleDone()
    expect(context.published.at(-1)).toEqual({ state: 'offline' })
    expect(context.commits).toEqual([])
    // 取り戻しが成功するまでは、一覧の全体を送らない
    expect(context.resets).toEqual([])
  })

  it('401 なら止めて、認証の側に知らせる（認証し直すまで再開しない）', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/notifications?')
          ? failedResult({ kind: 'auth_failed' })
          : undefined,
    })
    context.service.start(VIEWER)
    await vi.waitFor(() => expect(context.authFailures()).toBe(1))
    expect(context.published.at(-1)).toEqual({ state: 'auth_failed' })
    expect(context.timer.pending()).toBe(0)
  })

  it('利用制限なら、指示された時刻まで止める', async () => {
    const retryAt = new Date('2026-01-31T00:07:00Z')
    const context = setup({
      graphql: () => failedResult({ kind: 'rate_limited', retryAt }),
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.published.at(-1)).toEqual({
      state: 'rate_limited',
      retryAt: '2026-01-31T00:07:00.000Z',
    })
    expect(context.timer.pendingDelay()).toBe(7 * 60_000)
    expect(context.commits).toEqual([])
    // 利用制限で止めている間は、スリープから戻っても問い合わせない
    context.service.wake()
    expect(context.timer.pending()).toBe(1)
  })

  it('利用制限の残りが少なければ、4分ごとにする', async () => {
    const context = setup()
    context.rateBudget.observe(
      new Headers({
        'x-ratelimit-resource': 'graphql',
        'x-ratelimit-remaining': '400',
        'x-ratelimit-reset': String(Date.parse('2026-01-31T00:30:00Z') / 1000),
      }),
      NOW,
    )
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.timer.pendingDelay()).toBe(4 * 60_000)
  })

  it('保存できなければ、受け取りの状態は変えず、記録も進めずに次の回にやり直す（I-5）', async () => {
    const context = setup()
    context.failNextCommits()
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.published.at(-1)).toEqual({ state: 'syncing' })
    expect(context.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'error', kind: 'ingest.unexpected' }),
    )
    expect(context.timer.pendingDelay()).toBe(60_000)
  })

  it('1つのスレッドの分解に失敗したら、その記録と GitHub の通知の記録は進めず、次の回にそのスレッドだけやり直す', async () => {
    const context = setup({ graphql: notFoundFor(101) })
    context.service.start(VIEWER)
    await context.cycleDone()

    const [first] = context.commits
    expect(first?.githubNotifications).toBeUndefined()
    expect(first?.threads?.[ASSIGN_THREAD]).toEqual({
      reason: 'assign',
      updatedAt: '2026-01-30T23:47:29Z',
      // 次も同じ since から（since + 5分）
      expandedUntil: '2026-01-01T00:05:00.000Z',
      participating: false,
      consecutiveFailures: 1,
    })
    expect(context.published.at(-1)?.state).toBe('ok')

    context.timer.runNext()
    await context.cycleDone()
    // 同じ since で問い合わせ、失敗したスレッドだけを分解し直す
    expect(context.githubNotificationRequests()[1]?.path).toBe(
      context.githubNotificationRequests()[0]?.path,
    )
    expect(context.client.queries[1]?.variables).toMatchObject({ n0: 101 })
    expect(context.client.queries[1]?.variables).not.toHaveProperty('n1')
  })

  it('同じスレッドが続けて3回失敗したら、ログに残して記録を進める（component-backend.md 5.2）', async () => {
    const context = setup({ graphql: notFoundFor(101) })
    context.service.start(VIEWER)
    await context.cycleDone()
    for (let round = 0; round < 2; round += 1) {
      context.timer.runNext()
      await context.cycleDone()
    }
    expect(context.threads.get(ASSIGN_THREAD)).toMatchObject({
      expandedUntil: NOW_ISO,
      consecutiveFailures: 0,
    })
    expect(context.commits.at(-1)?.githubNotifications).toEqual({
      lastSuccessAt: NOW_ISO,
      etag: ETAG,
    })
    expect(context.logger.entries).toContainEqual({
      level: 'warn',
      kind: 'ingest.thread_given_up',
      fields: { reason: 'not_found', failures: 3 },
    })
  })

  it('所属チームを読めない（障害）ときは、チームを読めないときの判定で進める', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/user/teams')
          ? failedResult({ kind: 'github_error', status: 502 })
          : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.commits).toHaveLength(1)
    expect(context.logger.entries).toContainEqual({
      level: 'warn',
      kind: 'ingest.teams_unavailable',
      fields: { failure: 'github_error' },
    })
  })

  it('所属チームの問い合わせがつながらなければ、その回をやり直す', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/user/teams') ? failedResult({ kind: 'offline' }) : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.githubNotificationRequests()).toEqual([])
  })

  it('所属チームは24時間ごとに読み直す（github-api.md 6.）', async () => {
    const context = setup()
    const teamRequests = () => context.client.gets.filter((get) => get.endpoint === 'user_teams')
    context.service.start(VIEWER)
    await context.cycleDone()
    context.clock.now = new Date(NOW.getTime() + 23 * 60 * 60_000)
    context.timer.runNext()
    await context.cycleDone()
    expect(teamRequests()).toHaveLength(1)
    context.clock.now = new Date(NOW.getTime() + 24 * 60 * 60_000)
    context.timer.runNext()
    await context.cycleDone()
    expect(teamRequests()).toHaveLength(2)
  })
})

describe('M-9 と CI の結果（domain-model.md 4.1、CR-004、github-api.md 4.）', () => {
  it('理由がメンションなのに本文に @利用者 が無ければ、最新のコメントを読んで出来事にする（書き換えた応答）', async () => {
    const context = setup({
      graphql: withoutViewerMention(106),
    })
    context.service.start(VIEWER)
    await context.cycleDone()

    expect(context.client.gets.map((get) => get.path)).toContain(latestIssueComment.request.path)
    const fallback = context.events.find(
      (event) => event.id === `${MENTION_THREAD}@2026-01-30T19:41:59Z`,
    )
    expect(fallback).toMatchObject({
      type: 'mention',
      url: latestIssueComment.response.body.html_url,
      actor: { login: latestIssueComment.response.body.user.login },
    })
  })

  it('最新のコメントを読むときにつながらなければ、その回をやり直す（書き換えた応答）', async () => {
    const context = setup({
      get: (request) =>
        request.path === latestIssueComment.request.path
          ? failedResult({ kind: 'offline' })
          : undefined,
      graphql: withoutViewerMention(106),
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.commits).toEqual([])
  })

  it('ci_activity のスレッドは、利用者が起動したワークフロー実行を CI の結果にする（記録した応答）', async () => {
    const context = setup({
      get: (request) =>
        request.path.startsWith('/notifications?')
          ? okResult(ciThreads.response.body, HEADERS)
          : undefined,
    })
    context.service.start(VIEWER)
    await context.cycleDone()

    const runsRequest = context.client.gets.find((get) => get.endpoint === 'workflow_runs')
    expect(runsRequest?.path).toBe(
      '/repos/alice/tools/actions/runs?actor=alice&status=completed&created=%3E%3D2025-12-31&per_page=100',
    )
    expect(context.events.length).toBeGreaterThan(0)
    expect(context.events.every((event) => event.type === 'ci')).toBe(true)
    // state_change のスレッドは分解しない
    expect(context.client.queries).toEqual([])
    expect(Object.keys(context.commits[0]?.threads ?? {})).toEqual(['10867329022'])
    expect(context.commits[0]?.threads?.['10867329022']).toMatchObject({
      reason: 'ci_activity',
      consecutiveFailures: 0,
    })
  })

  it('ワークフロー実行のリポジトリに入れなければ、そのスレッドだけ失敗にする', async () => {
    const context = setup({
      get: (request) => {
        if (request.path.startsWith('/notifications?')) {
          return okResult(ciThreads.response.body, HEADERS)
        }
        if (request.endpoint === 'workflow_runs') {
          return failedResult({ kind: 'not_accessible', status: 404 })
        }
        return undefined
      },
    })
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.commits[0]?.threads?.['10867329022']?.consecutiveFailures).toBe(1)
  })
})

describe('止める（サインアウト・認証し直す）', () => {
  it('取り込みの途中で止めたら、保存せず、状態も知らせない（前のアカウントの出来事を残さない）', async () => {
    const holder: { service?: IngestService } = {}
    const context = setup({
      graphql: () => {
        holder.service?.stop()
        return undefined
      },
    })
    holder.service = context.service
    context.service.start(VIEWER)
    await vi.waitFor(() => expect(context.client.queries).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(context.commits).toEqual([])
    expect(context.published).toEqual([{ state: 'syncing' }])
    expect(context.timer.pending()).toBe(0)
  })

  it('止めたら予約を取り消す', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    context.service.stop()
    expect(context.timer.pending()).toBe(0)
    context.service.wake()
    expect(context.githubNotificationRequests()).toHaveLength(1)
  })

  it('もう一度始めたら、取り戻しからやり直す', async () => {
    const context = setup()
    context.service.start(VIEWER)
    await context.cycleDone()
    context.service.start(VIEWER)
    await context.cycleDone()
    expect(context.resets).toHaveLength(2)
  })
})
