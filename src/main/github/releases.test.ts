import { describe, expect, it } from 'vitest'
import recordedNone from '../../../test/fixtures/github/rest-releases-latest-none.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import type { GitHubResult } from './client'
import { fetchLatestRelease } from './releases'

const clientReturning = (result: GitHubResult) => createFakeGitHubClient({ get: () => result })

/**
 * 書き換えた応答: 版のある 200 の応答はまだ記録していない（配布用のリポジトリに版が無い。S7 で最初の版を出したら記録する。
 * test/fixtures/github/README.md の「まだ無い場面」）。github-api.md 6. で使う項目だけを持つ
 */
const releaseBody = {
  tag_name: 'v1.2.3',
  html_url: 'https://github.com/zonbitamago/github-inbox/releases/tag/v1.2.3',
}

// F-31。github-api.md 6.
describe('最新の版を取る（GET /repos/{owner}/{repo}/releases/latest）', () => {
  it('配布用のリポジトリの最新の版を問い合わせ、版と Releases のページを返す', async () => {
    const client = clientReturning(okResult(releaseBody))
    await expect(fetchLatestRelease(client)).resolves.toEqual({
      kind: 'ok',
      tagName: 'v1.2.3',
      htmlUrl: 'https://github.com/zonbitamago/github-inbox/releases/tag/v1.2.3',
    })
    expect(client.gets).toEqual([
      { endpoint: 'releases_latest', path: '/repos/zonbitamago/github-inbox/releases/latest' },
    ])
  })

  it('版がまだ1つも無い（記録した 404）なら、無いと返す', async () => {
    expect(recordedNone.response.status).toBe(404)
    const client = clientReturning(
      failedResult({ kind: 'not_accessible', status: recordedNone.response.status }),
    )
    await expect(fetchLatestRelease(client)).resolves.toEqual({ kind: 'none' })
  })

  it('404 でない 403 は、問い合わせの失敗のまま返す', async () => {
    const client = clientReturning(failedResult({ kind: 'not_accessible', status: 403 }))
    await expect(fetchLatestRelease(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'not_accessible', status: 403 },
    })
  })

  it('つながらないなどの失敗は、そのまま返す', async () => {
    const client = clientReturning(failedResult({ kind: 'offline' }))
    await expect(fetchLatestRelease(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'offline' },
    })
  })

  it('版の名前が無い応答は、想定外の応答とする', async () => {
    const client = clientReturning(okResult({ ...releaseBody, tag_name: undefined }))
    await expect(fetchLatestRelease(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 200 },
    })
  })

  it('変わっていない（304）という応答も、想定外の応答とする', async () => {
    const client = clientReturning(notModifiedResult())
    await expect(fetchLatestRelease(client)).resolves.toEqual({
      kind: 'failed',
      failure: { kind: 'github_error', status: 304 },
    })
  })
})
