import { describe, expect, it } from 'vitest'
import recordedTeams from '../../../test/fixtures/github/user-teams.json'
import recordedUser from '../../../test/fixtures/github/user.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import type { GitHubResult } from './client'
import { fetchTeams, fetchViewer, parseScopes } from './viewer'

const clientReturning = (result: GitHubResult) => createFakeGitHubClient({ get: () => result })

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
    expect(client.gets.map((request) => request.path)).toEqual(['/user'])
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

describe('所属チーム（github-api.md 6.、M-7）', () => {
  it('記録した応答（9チーム）を「組織/チーム」にする', async () => {
    const client = clientReturning(okResult(recordedTeams.response.body))
    const result = await fetchTeams(client)
    expect(client.gets).toEqual([{ endpoint: 'user_teams', path: '/user/teams?per_page=100' }])
    expect(result).toEqual({
      kind: 'ok',
      teams: recordedTeams.response.body.map((team) => `${team.organization.login}/${team.slug}`),
    })
    expect(result.kind === 'ok' ? result.teams : []).toContain('example-org/reviewers')
  })

  it.each([
    ['問い合わせの失敗', failedResult({ kind: 'offline' }), { kind: 'offline' }],
    ['形が合わない', okResult([{ name: 'x' }]), { kind: 'github_error', status: 200 }],
    ['304', notModifiedResult(), { kind: 'github_error', status: 304 }],
  ])(
    '%s → 失敗として返す（所属チームを読めないときの判定に代える）',
    async (_name, result, failure) => {
      await expect(fetchTeams(clientReturning(result))).resolves.toEqual({
        kind: 'failed',
        failure,
      })
    },
  )
})
