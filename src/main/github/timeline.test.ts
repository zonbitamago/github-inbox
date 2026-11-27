import { describe, expect, it } from 'vitest'
import expandOthers from '../../../test/fixtures/github/graphql-expand-others-prs-and-issue.json'
import expandOwn from '../../../test/fixtures/github/graphql-expand-own-prs.json'
import {
  createFakeGitHubClient,
  failedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import type { GitHubResult, GraphQLRequest } from './client'
import { expandQuery, fetchExpandSubjects, type ExpandTarget } from './timeline'

const SINCE = '2026-01-01T00:00:00Z'

/** 記録した問い合わせの変数から、分解するスレッドを作る（スレッドの id は架空のもの） */
function targetsOf(
  recorded: typeof expandOwn | typeof expandOthers,
  kinds: ExpandTarget['kind'][],
): ExpandTarget[] {
  const variables: Record<string, unknown> = recorded.request.body.variables
  return kinds.map((kind, index) => ({
    threadId: `thread-${index}`,
    kind,
    owner: String(variables[`o${index}`]),
    name: String(variables[`r${index}`]),
    number: Number(variables[`n${index}`]),
    since: SINCE,
  }))
}

const ownTargets = () => targetsOf(expandOwn, ['pull_request', 'pull_request'])
const othersTargets = () =>
  targetsOf(expandOthers, ['pull_request', 'pull_request', 'issue', 'pull_request'])

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/** 記録した応答の data を書き換えて返す（書き換えた応答） */
function recordedData(recorded: typeof expandOwn | typeof expandOthers): Record<string, unknown> {
  return structuredClone(recorded.response.body.data)
}

function graphqlClient(answer: (request: GraphQLRequest) => GitHubResult) {
  return createFakeGitHubClient({ graphql: answer })
}

describe('問い合わせの文（github-api.md 3.）', () => {
  it.each([
    ['利用者が作った PR 2件', expandOwn, ownTargets],
    ['他人の PR 3件と issue 1件', expandOthers, othersTargets],
  ])('記録したときの文と同じ（%s）', (_name, recorded, targets) => {
    expect(normalize(expandQuery(targets()))).toBe(normalize(recorded.request.body.query))
  })

  it('mutation を書かない（N-06）', () => {
    expect(expandQuery(othersTargets())).not.toMatch(/\bmutation\b/)
  })
})

describe('まとめた分解の問い合わせ（github-api.md 3.、CR-009）', () => {
  it('記録した応答（利用者が作った PR 2件）を、スレッドごとの PR にする。変数は記録したときと同じ', async () => {
    const client = graphqlClient(() =>
      okResult(expandOwn.response.body, expandOwn.response.headers),
    )
    const result = await fetchExpandSubjects(client, ownTargets())

    expect(client.queries).toHaveLength(1)
    expect(client.queries[0]?.variables).toEqual(expandOwn.request.body.variables)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.subjects.get('thread-0')).toMatchObject({
      kind: 'ok',
      subject: { kind: 'pull_request', node: { number: 101 } },
    })
    expect(result.subjects.get('thread-1')).toMatchObject({
      kind: 'ok',
      subject: { kind: 'pull_request', node: { number: 139 } },
    })
  })

  it('記録した応答（他人の PR と issue）。issue は issue として返す（CR-001）', async () => {
    const client = graphqlClient(() =>
      okResult(expandOthers.response.body, expandOthers.response.headers),
    )
    const result = await fetchExpandSubjects(client, othersTargets())
    if (result.kind !== 'ok') throw new Error('失敗した')
    expect(result.subjects.get('thread-2')).toMatchObject({
      kind: 'ok',
      subject: { kind: 'issue', node: { number: 120 } },
    })
    expect([...result.subjects.values()].every((subject) => subject.kind === 'ok')).toBe(true)
  })

  it('since の順に並べて20件ずつまとめ、まとめた中で一番古い since を使う（CR-009）', async () => {
    const targets: ExpandTarget[] = Array.from({ length: 45 }, (_, index) => ({
      threadId: `t-${index}`,
      kind: 'issue',
      owner: 'example-org',
      name: 'docs',
      number: index + 1,
      // 新しい順に渡す
      since: new Date(Date.UTC(2026, 0, 31) - index * 60_000).toISOString(),
    }))
    const client = graphqlClient((request) => {
      const data: Record<string, unknown> = {}
      for (const key of Object.keys(request.variables).filter((name) => name.startsWith('n'))) {
        data[`t${key.slice(1)}`] = { issue: null }
      }
      return okResult({ data })
    })
    await fetchExpandSubjects(client, targets)

    expect(client.queries.map((query) => Object.keys(query.variables).length)).toEqual([
      1 + 20 * 3,
      1 + 20 * 3,
      1 + 5 * 3,
    ])
    // GitHub の形（秒まで）にして渡す
    const oldestFirst = targets.map((target) => target.since.replace('.000Z', 'Z')).toSorted()
    expect(client.queries.map((query) => query.variables['since'])).toEqual([
      oldestFirst[0],
      oldestFirst[20],
      oldestFirst[40],
    ])
  })

  it('スレッドが無ければ問い合わせない', async () => {
    const client = graphqlClient(() => okResult({}))
    await expect(fetchExpandSubjects(client, [])).resolves.toEqual({
      kind: 'ok',
      subjects: new Map(),
    })
    expect(client.queries).toEqual([])
  })
})

describe('一部の別名だけが失敗したとき（github-api.md 3.、component-backend.md 5.2）', () => {
  it.each([
    [
      'errors に NOT_FOUND（消えた）',
      { errors: [{ type: 'NOT_FOUND', path: ['t1', 'pullRequest'] }] },
      'not_found',
    ],
    [
      'errors に FORBIDDEN（入れない）',
      { errors: [{ type: 'FORBIDDEN', path: ['t1'] }] },
      'not_accessible',
    ],
    ['errors にそのほか', { errors: [{ type: 'SOMETHING', path: ['t1'] }] }, 'graphql_error'],
    ['リポジトリが null', { data: { t1: null } }, 'not_found'],
    ['PR が null', { data: { t1: { pullRequest: null } } }, 'not_found'],
    ['形が合わない', { data: { t1: { pullRequest: { id: 'x' } } } }, 'invalid_shape'],
  ])('%s → そのスレッドだけ失敗にする（書き換えた応答）', async (_name, change, reason) => {
    const body = {
      data: { ...recordedData(expandOwn), ...('data' in change ? change.data : {}) },
      ...('errors' in change ? { errors: change.errors } : {}),
    }
    const client = graphqlClient(() => okResult(body, expandOwn.response.headers))
    const result = await fetchExpandSubjects(client, ownTargets())
    if (result.kind !== 'ok') throw new Error('全体が失敗した')
    expect(result.subjects.get('thread-0')?.kind).toBe('ok')
    expect(result.subjects.get('thread-1')).toEqual({ kind: 'failed', reason })
  })
})

describe('問い合わせそのものが失敗したとき（component-backend.md 6.3）', () => {
  it.each([
    ['つながらない', failedResult({ kind: 'offline' }), { kind: 'offline' }],
    ['401', failedResult({ kind: 'auth_failed' }), { kind: 'auth_failed' }],
    [
      '200 で errors に RATE_LIMITED（書き換えた応答）',
      okResult(
        { data: null, errors: [{ type: 'RATE_LIMITED' }] },
        { 'x-ratelimit-reset': '1769821269' },
      ),
      { kind: 'rate_limited', retryAt: new Date(1769821269 * 1000) },
    ],
    [
      'RATE_LIMITED で止める時刻が分からない（書き換えた応答）',
      okResult({ data: null, errors: [{ type: 'RATE_LIMITED' }] }),
      { kind: 'github_error', status: 200 },
    ],
    [
      'data が無い（書き換えた応答）',
      okResult({ errors: [{ message: 'x' }] }),
      { kind: 'github_error', status: 200 },
    ],
    ['本文の形が合わない', okResult('text'), { kind: 'github_error', status: 200 }],
    [
      '304',
      { kind: 'not_modified', headers: new Headers() },
      { kind: 'github_error', status: 304 },
    ],
  ] satisfies [string, GitHubResult, unknown][])(
    '%s → 全体を失敗にする（その回をやり直す）',
    async (_name, answer, failure) => {
      const client = graphqlClient(() => answer)
      await expect(fetchExpandSubjects(client, ownTargets())).resolves.toEqual({
        kind: 'failed',
        failure,
      })
    },
  )

  it('まとめた問い合わせ全体が 403 なら、入れたスレッドそれぞれの失敗にする', async () => {
    const client = graphqlClient(() => failedResult({ kind: 'not_accessible', status: 403 }))
    const result = await fetchExpandSubjects(client, ownTargets())
    expect(result).toEqual({
      kind: 'ok',
      subjects: new Map([
        ['thread-0', { kind: 'failed', reason: 'not_accessible' }],
        ['thread-1', { kind: 'failed', reason: 'not_accessible' }],
      ]),
    })
  })

  it('いくつかの問い合わせが別々に失敗したら、重い方（認証が切れた）を返す', async () => {
    const targets = Array.from({ length: 21 }, (_, index): ExpandTarget => ({
      threadId: `t-${index}`,
      kind: 'issue',
      owner: 'o',
      name: 'r',
      number: index,
      since: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    }))
    const client = graphqlClient((request) =>
      'o20' in request.variables
        ? failedResult({ kind: 'offline' })
        : failedResult({ kind: 'auth_failed' }),
    )
    await expect(fetchExpandSubjects(client, targets)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'auth_failed' },
    })
  })
})

describe('続きのページ（github-api.md 3.、CR-002）', () => {
  /** 記録した t0（PR #101）の timelineItems に続きがあることにする（書き換えた応答） */
  function withTimelineNext(): Record<string, unknown> {
    const data = recordedData(expandOwn)
    const own = expandOwn.response.body.data.t0.pullRequest
    data['t0'] = {
      pullRequest: {
        ...own,
        timelineItems: {
          ...own.timelineItems,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
    }
    return data
  }

  const extraComment = {
    __typename: 'IssueComment',
    id: 'IC_extra',
    url: 'https://github.com/example-org/app/pull/101#issuecomment-1',
    createdAt: '2026-01-20T00:00:00Z',
    body: '続きのコメント',
    author: { login: 'bob', __typename: 'User' },
  }

  it('timelineItems の hasNextPage が真なら、そのスレッドだけ after で続きを取り、つなげる', async () => {
    const client = graphqlClient((request) => {
      if (request.query.startsWith('query ExpandPrTimeline')) {
        return okResult({
          data: {
            repository: {
              pullRequest: {
                timelineItems: {
                  pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
                  nodes: [extraComment],
                },
              },
            },
          },
        })
      }
      return okResult({ data: withTimelineNext() })
    })
    const result = await fetchExpandSubjects(client, ownTargets())

    expect(client.queries).toHaveLength(2)
    expect(client.queries[1]?.variables).toEqual({
      since: SINCE,
      o: 'example-org',
      r: 'app',
      n: 101,
      after: 'cursor-1',
    })
    if (result.kind !== 'ok') throw new Error('失敗した')
    const subject = result.subjects.get('thread-0')
    if (subject?.kind !== 'ok') throw new Error('失敗した')
    const ids = subject.subject.node.timelineItems.nodes.map((node) => node.id)
    expect(ids.at(-1)).toBe('IC_extra')
    expect(ids).toHaveLength(
      expandOwn.response.body.data.t0.pullRequest.timelineItems.nodes.length + 1,
    )
  })

  it('issue の timelineItems も after でたどる', async () => {
    const data = recordedData(expandOthers)
    const issue = expandOthers.response.body.data.t2.issue
    data['t2'] = {
      issue: {
        ...issue,
        timelineItems: { ...issue.timelineItems, pageInfo: { hasNextPage: true, endCursor: 'c' } },
      },
    }
    const client = graphqlClient((request) =>
      request.query.startsWith('query ExpandIssueTimeline')
        ? okResult({
            data: {
              repository: {
                issue: {
                  timelineItems: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [extraComment],
                  },
                },
              },
            },
          })
        : okResult({ data }),
    )
    const result = await fetchExpandSubjects(client, othersTargets())
    if (result.kind !== 'ok') throw new Error('失敗した')
    const subject = result.subjects.get('thread-2')
    if (subject?.kind !== 'ok') throw new Error('失敗した')
    expect(subject.subject.node.timelineItems.nodes.at(-1)?.id).toBe('IC_extra')
  })

  /** 記録した t0 の reviews に前のページがあることにする（書き換えた応答） */
  function withPreviousReviews(oldestSubmittedAt: string): Record<string, unknown> {
    const data = recordedData(expandOwn)
    const own = expandOwn.response.body.data.t0.pullRequest
    const [oldest, ...rest] = own.reviews.nodes
    data['t0'] = {
      pullRequest: {
        ...own,
        reviews: {
          pageInfo: { hasPreviousPage: true, startCursor: 'before-1' },
          nodes: [{ ...oldest, submittedAt: oldestSubmittedAt }, ...rest],
        },
      },
    }
    return data
  }

  const olderReview = {
    id: 'PRR_older',
    url: 'https://github.com/example-org/app/pull/101#pullrequestreview-1',
    state: 'COMMENTED',
    createdAt: '2026-01-02T00:00:00Z',
    submittedAt: '2026-01-02T00:00:00Z',
    body: '前のレビュー',
    author: { login: 'bob', __typename: 'User' },
    comments: { nodes: [] },
  }

  it('reviews の一番古いものが since 以降で hasPreviousPage が真なら、before で前へたどり、前につなげる', async () => {
    const client = graphqlClient((request) =>
      request.query.startsWith('query ExpandPrReviews')
        ? okResult({
            data: {
              repository: {
                pullRequest: {
                  reviews: {
                    pageInfo: { hasPreviousPage: false, startCursor: 'before-2' },
                    nodes: [olderReview],
                  },
                },
              },
            },
          })
        : okResult({ data: withPreviousReviews('2026-01-05T00:00:00Z') }),
    )
    const result = await fetchExpandSubjects(client, ownTargets())

    expect(client.queries[1]?.variables).toEqual({
      o: 'example-org',
      r: 'app',
      n: 101,
      before: 'before-1',
    })
    if (result.kind !== 'ok') throw new Error('失敗した')
    const subject = result.subjects.get('thread-0')
    if (subject?.kind !== 'ok' || subject.subject.kind !== 'pull_request') {
      throw new Error('失敗した')
    }
    expect(subject.subject.node.reviews.nodes[0]?.id).toBe('PRR_older')
  })

  it('境目: 一番古いものが since より前なら、前へたどらない', async () => {
    const client = graphqlClient(() =>
      okResult({ data: withPreviousReviews('2025-12-31T23:59:59Z') }),
    )
    await fetchExpandSubjects(client, ownTargets())
    expect(client.queries).toHaveLength(1)
  })

  it.each([
    ['つながらない', failedResult({ kind: 'offline' }), 'failed'],
    ['404', failedResult({ kind: 'not_accessible', status: 404 }), 'thread'],
    ['別名の errors', okResult({ data: {}, errors: [{ path: ['repository'] }] }), 'thread'],
    ['形が合わない', okResult({ data: { repository: { pullRequest: {} } } }), 'thread'],
  ])('続きの問い合わせが %s', async (_name, answer, expected) => {
    const client = graphqlClient((request) =>
      request.query.startsWith('query ExpandPrTimeline')
        ? answer
        : okResult({ data: withTimelineNext() }),
    )
    const result = await fetchExpandSubjects(client, ownTargets())
    if (expected === 'failed') {
      expect(result).toEqual({ kind: 'failed', failure: { kind: 'offline' } })
      return
    }
    if (result.kind !== 'ok') throw new Error('全体が失敗した')
    expect(result.subjects.get('thread-0')?.kind).toBe('failed')
    expect(result.subjects.get('thread-1')?.kind).toBe('ok')
  })

  it('reviews の続きの形が合わなければ、そのスレッドだけ失敗にする', async () => {
    const client = graphqlClient((request) =>
      request.query.startsWith('query ExpandPrReviews')
        ? okResult({ data: { repository: { pullRequest: { reviews: {} } } } })
        : okResult({ data: withPreviousReviews('2026-01-05T00:00:00Z') }),
    )
    const result = await fetchExpandSubjects(client, ownTargets())
    if (result.kind !== 'ok') throw new Error('全体が失敗した')
    expect(result.subjects.get('thread-0')).toEqual({ kind: 'failed', reason: 'invalid_shape' })
  })
})
