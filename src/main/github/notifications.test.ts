import { describe, expect, it } from 'vitest'
import notificationsAll from '../../../test/fixtures/github/notifications-all.json'
import notModified from '../../../test/fixtures/github/notifications-not-modified.json'
import latestIssueBody from '../../../test/fixtures/github/rest-latest-comment-issue-body.json'
import latestIssueComment from '../../../test/fixtures/github/rest-latest-comment-issue-comment.json'
import latestPrBody from '../../../test/fixtures/github/rest-latest-comment-pr-body.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import type { GetRequest, GitHubResult } from './client'
import { fetchLatestComment, fetchGitHubNotifications } from './notifications'

const SINCE = '2026-01-30T00:00:00.000Z'
const recordedHeaders = notificationsAll.response.headers
const recordedBody = notificationsAll.response.body

/** 記録した応答の Link（次のページ）を外したもの（書き換えた応答） */
const singlePageHeaders = Object.fromEntries(
  Object.entries(recordedHeaders).filter(([name]) => name !== 'link'),
)

function clientFor(answer: (request: GetRequest) => GitHubResult) {
  return createFakeGitHubClient({ get: answer })
}

describe('GitHub の通知を問い合わせる（github-api.md 2.）', () => {
  it('all=true・since・per_page=50 で問い合わせ、前回の ETag を If-None-Match に付ける（CR-003）', async () => {
    const client = clientFor(() => okResult(recordedBody, singlePageHeaders))
    await fetchGitHubNotifications(client, { since: SINCE, etag: '"previous"' })

    const [request] = client.gets
    const url = new URL(request?.path ?? '', 'https://api.github.com')
    expect(url.pathname).toBe('/notifications')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      all: 'true',
      // GitHub の形（秒まで）にして渡す
      since: '2026-01-30T00:00:00Z',
      per_page: '50',
    })
    expect(request?.headers).toEqual({ 'If-None-Match': '"previous"' })
  })

  it('ETag がまだ無ければ If-None-Match を付けない', async () => {
    const client = clientFor(() => okResult(recordedBody, singlePageHeaders))
    await fetchGitHubNotifications(client, { since: SINCE, etag: undefined })
    expect(client.gets[0]?.headers).toEqual({})
  })

  it('記録した応答（50件。Link を外した書き換えた応答）を、使う項目だけのスレッドにする', async () => {
    const client = clientFor(() => okResult(recordedBody, singlePageHeaders))
    const result = await fetchGitHubNotifications(client, { since: SINCE, etag: undefined })

    expect(result).toMatchObject({
      kind: 'ok',
      etag: recordedHeaders.etag,
      pollIntervalSeconds: 60,
    })
    if (result.kind !== 'ok') return
    expect(result.threads).toHaveLength(50)
    expect(result.threads[0]).toEqual({
      id: '49230809513',
      reason: 'assign',
      updatedAt: '2026-01-30T23:47:29Z',
      subjectType: 'PullRequest',
      subjectUrl: 'https://api.github.com/repos/example-org/app/pulls/101',
      latestCommentUrl: null,
      repository: 'example-org/app',
    })
  })

  it('Link の次のページをたどり、つなげる。ETag と間隔は最初のページのもの（書き換えた応答）', async () => {
    const client = clientFor((request) =>
      request.path.endsWith('page=2')
        ? okResult(recordedBody.slice(30), { ...singlePageHeaders, etag: '"page-2"' })
        : okResult(recordedBody.slice(0, 30), {
            ...recordedHeaders,
            link: '<https://api.github.com/notifications?all=true&per_page=50&page=2>; rel="next"',
          }),
    )
    const result = await fetchGitHubNotifications(client, { since: SINCE, etag: '"previous"' })

    expect(client.gets.map((request) => request.path)).toEqual([
      expect.stringMatching(/^\/notifications\?/),
      '/notifications?all=true&per_page=50&page=2',
    ])
    // 続きのページには If-None-Match を付けない
    expect(client.gets[1]?.headers).toBeUndefined()
    expect(result).toMatchObject({ kind: 'ok', etag: recordedHeaders.etag })
    if (result.kind === 'ok') expect(result.threads).toHaveLength(50)
  })

  it('記録した 304（If-None-Match）は、変わっていないとする', async () => {
    const client = clientFor(() => notModifiedResult(notModified.response.headers))
    await expect(fetchGitHubNotifications(client, { since: SINCE, etag: '"x"' })).resolves.toEqual({
      kind: 'not_modified',
      pollIntervalSeconds: 60,
    })
  })

  it.each([
    ['X-Poll-Interval が無い', {}],
    ['X-Poll-Interval が数でない', { 'x-poll-interval': 'soon' }],
  ])('%s → 間隔は返さない（書き換えた応答）', async (_name, headers) => {
    const client = clientFor(() => notModifiedResult(headers))
    await expect(fetchGitHubNotifications(client, { since: SINCE, etag: '"x"' })).resolves.toEqual({
      kind: 'not_modified',
    })
  })

  it('問い合わせの失敗は、分類したまま返す', async () => {
    const client = clientFor(() => failedResult({ kind: 'offline' }))
    await expect(
      fetchGitHubNotifications(client, { since: SINCE, etag: undefined }),
    ).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'offline' },
    })
  })

  it.each([
    ['配列でない', { message: 'unexpected' }],
    ['使う項目が欠けている', [{ id: '1', reason: 'mention' }]],
  ])('%s → 想定外の応答（github_error。書き換えた応答）', async (_name, body) => {
    const client = clientFor(() => okResult(body, singlePageHeaders))
    await expect(
      fetchGitHubNotifications(client, { since: SINCE, etag: undefined }),
    ).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('続きのページが 304 なら、想定外の応答とする（書き換えた応答）', async () => {
    const client = clientFor((request) =>
      request.path.endsWith('page=2')
        ? notModifiedResult()
        : okResult(recordedBody, {
            ...recordedHeaders,
            link: '<https://api.github.com/notifications?page=2>; rel="next"',
          }),
    )
    await expect(
      fetchGitHubNotifications(client, { since: SINCE, etag: undefined }),
    ).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 304 },
    })
  })
})

describe('最新のコメントを読む（M-9。CR-004）', () => {
  it.each([
    ['PR そのもの', latestPrBody],
    ['issue そのもの（bot が作った issue）', latestIssueBody],
    ['issue のコメント', latestIssueComment],
  ])('記録した応答（%s）から、発言者・開く先・本文を取る', async (_name, recorded) => {
    const client = clientFor(() => okResult(recorded.response.body))
    const url = `https://api.github.com${recorded.request.path}`
    await expect(fetchLatestComment(client, url)).resolves.toEqual({
      kind: 'ok',
      comment: {
        html_url: recorded.response.body.html_url,
        body: recorded.response.body.body,
        user: { login: recorded.response.body.user.login, type: recorded.response.body.user.type },
      },
    })
    expect(client.gets).toEqual([{ endpoint: 'latest_comment', path: recorded.request.path }])
  })

  it('api.github.com の外を指すなら、問い合わせずに読めなかったとする', async () => {
    const client = clientFor(() => okResult({}))
    await expect(fetchLatestComment(client, 'https://example.com/x')).resolves.toEqual({
      kind: 'unavailable',
    })
    expect(client.gets).toEqual([])
  })

  it.each([
    ['404（消えた）', failedResult({ kind: 'not_accessible', status: 404 })],
    ['304', notModifiedResult()],
    [
      '開く先が github.com のページでない（書き換えた応答）',
      okResult({ ...latestPrBody.response.body, html_url: 'https://example.com/pull/1' }),
    ],
    ['形が合わない', okResult({ body: 'x' })],
  ])('%s → 読めなかったとする（対象の作者で代える）', async (_name, answer) => {
    const client = clientFor(() => answer)
    await expect(
      fetchLatestComment(client, 'https://api.github.com/repos/o/r/issues/1'),
    ).resolves.toEqual({ kind: 'unavailable' })
  })

  it('本文が無い・発言者が消えた（書き換えた応答）', async () => {
    const client = clientFor(() =>
      okResult({ html_url: 'https://github.com/o/r/pull/1', body: null, user: null }),
    )
    await expect(
      fetchLatestComment(client, 'https://api.github.com/repos/o/r/pulls/1'),
    ).resolves.toEqual({
      kind: 'ok',
      comment: { html_url: 'https://github.com/o/r/pull/1', body: null, user: null },
    })
  })

  it('つながらないなどは、分類したまま返す（その回の取り込みをやり直す）', async () => {
    const client = clientFor(() => failedResult({ kind: 'offline' }))
    await expect(
      fetchLatestComment(client, 'https://api.github.com/repos/o/r/issues/1'),
    ).resolves.toEqual({ kind: 'failed', failure: { kind: 'offline' } })
  })
})
