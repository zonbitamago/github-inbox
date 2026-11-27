import { describe, expect, it } from 'vitest'
import recordedUser from '../../../test/fixtures/github/user.json'
import type { GitHubClient, GitHubResult } from './client'
import { fetchViewer, parseScopes } from './viewer'

function clientReturning(result: GitHubResult): GitHubClient & { paths: string[] } {
  const paths: string[] = []
  return {
    paths,
    get: (request) => {
      paths.push(request.path)
      return Promise.resolve(result)
    },
  }
}

function okResult(body: unknown, headers: Record<string, string>): GitHubResult {
  return { kind: 'ok', status: 200, headers: new Headers(headers), body }
}

describe('スコープの読み方（auth-flow.md 3.）', () => {
  it.each([
    ['カンマと空白で区切る', 'repo, notifications', ['repo', 'notifications']],
    [
      '記録した応答（gh CLI のトークン）',
      'gist, read:org, repo, workflow',
      ['gist', 'read:org', 'repo', 'workflow'],
    ],
    ['スコープが1つも無い classic PAT', '', []],
    ['ヘッダーが無い（fine-grained PAT）', null, null],
  ])('%s', (_name, header, expected) => {
    expect(parseScopes(header)).toEqual(expected)
  })
})

describe('利用者を取る（github-api.md 6. の GET /user）', () => {
  it('記録した応答から、ユーザー名とスコープを取る', async () => {
    const client = clientReturning(
      okResult(recordedUser.response.body, recordedUser.response.headers),
    )
    await expect(fetchViewer(client)).resolves.toEqual({
      kind: 'ok',
      login: 'alice',
      scopes: ['gist', 'read:org', 'repo', 'workflow'],
    })
    expect(client.paths).toEqual(['/user'])
  })

  it('ユーザー名の無い応答（書き換えた応答）は、想定外の応答とする', async () => {
    const withoutLogin = { ...recordedUser.response.body, login: undefined }
    const client = clientReturning(okResult(withoutLogin, recordedUser.response.headers))
    await expect(fetchViewer(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('変わっていない（304）という応答も、想定外の応答とする', async () => {
    const client = clientReturning({ kind: 'not_modified', headers: new Headers() })
    await expect(fetchViewer(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 304 },
    })
  })

  it('問い合わせの失敗はそのまま返す', async () => {
    const client = clientReturning({ kind: 'failed', failure: { kind: 'auth_failed' } })
    await expect(fetchViewer(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'auth_failed' },
    })
  })
})
