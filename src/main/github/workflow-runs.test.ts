import { describe, expect, it } from 'vitest'
import recorded from '../../../test/fixtures/github/rest-workflow-runs.json'
import {
  createFakeGitHubClient,
  failedResult,
  notModifiedResult,
  okResult,
} from '../../../test/support/fake-github-client'
import { recordedWorkflowRuns } from '../../../test/support/github-fixtures'
import type { GetRequest, GitHubResult } from './client'
import { createdFrom, fetchWorkflowRuns } from './workflow-runs'

const options = { repository: 'alice/tools', actor: 'alice', since: '2026-01-02T08:20:16.000Z' }

function clientFor(answer: (request: GetRequest) => GitHubResult) {
  return createFakeGitHubClient({ get: answer })
}

describe('ワークフロー実行の問い合わせ（github-api.md 4.）', () => {
  it('記録したときと同じ問い合わせになる（actor・completed・since の前の日から・100件）', async () => {
    const client = clientFor(() => okResult(recorded.response.body, recorded.response.headers))
    await fetchWorkflowRuns(client, options)
    expect(client.gets).toEqual([{ endpoint: 'workflow_runs', path: recorded.request.path }])
  })

  it('記録した応答（11件）を、判定の材料の形にする', async () => {
    const client = clientFor(() => okResult(recorded.response.body, recorded.response.headers))
    await expect(fetchWorkflowRuns(client, options)).resolves.toEqual({
      kind: 'ok',
      runs: recordedWorkflowRuns().map((run) => ({
        node_id: run.node_id,
        run_attempt: run.run_attempt,
        name: run.name,
        display_title: run.display_title,
        head_branch: run.head_branch,
        html_url: run.html_url,
        status: run.status,
        conclusion: run.conclusion,
        updated_at: run.updated_at,
        triggering_actor:
          run.triggering_actor === null
            ? null
            : { login: run.triggering_actor.login, type: run.triggering_actor.type },
      })),
    })
  })

  it.each([
    ['日付の途中', '2026-01-02T08:20:16Z', '2026-01-01'],
    ['境目: 日付の始まりちょうど', '2026-01-02T00:00:00Z', '2026-01-01'],
    ['境目: 日付の終わりの1秒前', '2026-01-01T23:59:59Z', '2025-12-31'],
  ])('作られた日付の絞り込みは since の前の日（UTC）から: %s', (_name, since, expected) => {
    expect(createdFrom(since)).toBe(expected)
  })

  it('Link の次のページもたどる（書き換えた応答）', async () => {
    const body = recorded.response.body
    const client = clientFor((request) =>
      request.path.endsWith('page=2')
        ? okResult({ ...body, workflow_runs: body.workflow_runs.slice(5) })
        : okResult(
            { ...body, workflow_runs: body.workflow_runs.slice(0, 5) },
            { link: '<https://api.github.com/repos/alice/tools/actions/runs?page=2>; rel="next"' },
          ),
    )
    const result = await fetchWorkflowRuns(client, options)
    expect(result.kind === 'ok' ? result.runs : []).toHaveLength(body.workflow_runs.length)
  })

  it.each([
    ['問い合わせの失敗は分類したまま', failedResult({ kind: 'offline' }), { kind: 'offline' }],
    [
      '入れないリポジトリ',
      failedResult({ kind: 'not_accessible', status: 404 }),
      { kind: 'not_accessible', status: 404 },
    ],
    ['形が合わない', okResult({ total_count: 0 }), { kind: 'github_error', status: 200 }],
    ['304', notModifiedResult(), { kind: 'github_error', status: 304 }],
  ])('%s', async (_name, answer, failure) => {
    const client = clientFor(() => answer)
    await expect(fetchWorkflowRuns(client, options)).resolves.toEqual({ kind: 'failed', failure })
  })
})
