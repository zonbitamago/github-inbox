import { describe, expect, it } from 'vitest'
import {
  RECORDED_CI_SINCE,
  VIEWER,
  recordedWorkflowRuns,
} from '../../../test/support/github-fixtures'
import { GitHubEventSchema } from '../../shared/domain'
import { expandWorkflowRuns, type ExpandRunsInput } from './expand-workflow-runs'
import type { GhWorkflowRun } from './github-shapes'

const RECEIVED_AT = '2026-01-02T09:00:00.000Z'

function input(change: Partial<ExpandRunsInput> = {}): ExpandRunsInput {
  return {
    viewer: VIEWER,
    repository: 'alice/tools',
    runs: recordedWorkflowRuns(),
    since: RECORDED_CI_SINCE,
    receivedAt: RECEIVED_AT,
    ...change,
  }
}

const byViewer = (run: GhWorkflowRun) => run.triggering_actor?.login === VIEWER

// domain-model.md 4.1: CI は、利用者が起動したワークフロー実行のうち完了したものを、結果を問わず ci にする（F-05）
describe('CI の結果の分解（github-api.md 4.）', () => {
  it('利用者が起動した実行だけを出来事にする（actor の絞り込みは効かず、bot の実行も返ってくる）', () => {
    const runs = recordedWorkflowRuns()
    const events = expandWorkflowRuns(input())
    expect(runs.some((run) => !byViewer(run))).toBe(true)
    expect(events).toHaveLength(runs.filter(byViewer).length)
    expect(events.every((event) => event.type === 'ci' && event.actor.login === VIEWER)).toBe(true)
  })

  it('id は実行の node ID ＋ # ＋ やり直しの回数（domain-model.md 3.）。やり直しは別の出来事', () => {
    const rerun = recordedWorkflowRuns().find((run) => run.run_attempt === 2)!
    const event = expandWorkflowRuns(input()).find(
      (candidate) => candidate.id === `${rerun.node_id}#2`,
    )
    expect(event).toMatchObject({
      occurredAt: rerun.updated_at,
      url: rerun.html_url,
      ciConclusion: rerun.conclusion,
    })
    const first = expandWorkflowRuns(input({ runs: [{ ...rerun, run_attempt: 1 }] }))[0]
    expect(first?.id).toBe(`${rerun.node_id}#1`)
  })

  it('対象は workflow_run で、番号は持たない。どれも GitHubEvent の形（I-3）', () => {
    for (const event of expandWorkflowRuns(input())) {
      expect(event.target.kind).toBe('workflow_run')
      expect(event.target.number).toBeUndefined()
      expect(event.target.repository).toBe('alice/tools')
      expect(event.receivedAt).toBe(RECEIVED_AT)
      expect(GitHubEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it('対象のタイトルは「ワークフロー名: 表示のタイトル（ブランチ）」', () => {
    const run = recordedWorkflowRuns().find(
      (candidate) => byViewer(candidate) && candidate.head_branch === 'main',
    )!
    const [event] = expandWorkflowRuns(input({ runs: [run] }))
    expect(event?.target.title).toBe(`ci: ${run.display_title}（main）`)
  })

  it.each([
    ['ワークフロー名が無い', { name: null }, 'ログイン画面の文言を直す（main）'],
    ['ブランチが無い', { head_branch: null }, 'ci: ログイン画面の文言を直す'],
  ])('%s（書き換えた応答）', (_name, change, expected) => {
    const run = {
      ...recordedWorkflowRuns().find(byViewer)!,
      name: 'ci',
      head_branch: 'main',
      display_title: 'ログイン画面の文言を直す',
      ...change,
    }
    expect(expandWorkflowRuns(input({ runs: [run] }))[0]?.target.title).toBe(expected)
  })

  it.each([['success'], ['failure'], ['cancelled'], ['timed_out'], ['startup_failure']])(
    '結果 %s は GitHub の値のまま ciConclusion に入れる（書き換えた応答）',
    (conclusion) => {
      const run = { ...recordedWorkflowRuns().find(byViewer)!, conclusion }
      expect(expandWorkflowRuns(input({ runs: [run] }))[0]?.ciConclusion).toBe(conclusion)
    },
  )

  it.each([
    ['実行中', { status: 'in_progress', conclusion: null }],
    ['完了したのに結果が無い', { status: 'completed', conclusion: null }],
  ])('%s の実行は出来事にしない（書き換えた応答）', (_name, change) => {
    const run = { ...recordedWorkflowRuns().find(byViewer)!, ...change }
    expect(expandWorkflowRuns(input({ runs: [run] }))).toEqual([])
  })

  it('起動した人が分からない（null）実行は出来事にしない（書き換えた応答）', () => {
    const run = { ...recordedWorkflowRuns().find(byViewer)!, triggering_actor: null }
    expect(expandWorkflowRuns(input({ runs: [run] }))).toEqual([])
  })

  it('起動した人の名前は大文字と小文字を区別しない（書き換えた応答）', () => {
    const run = {
      ...recordedWorkflowRuns().find(byViewer)!,
      triggering_actor: { login: 'ALICE', type: 'User' },
    }
    expect(expandWorkflowRuns(input({ runs: [run] }))[0]?.actor).toEqual({
      login: 'ALICE',
      isBot: false,
    })
  })

  it('since ちょうどの実行は入れ、それより前に終わった実行は入れない（やり直しは updated_at で決める）', () => {
    const run = recordedWorkflowRuns().find((candidate) => candidate.run_attempt === 2)!
    const at = (since: string) => expandWorkflowRuns(input({ runs: [run], since })).length
    expect(at(run.updated_at)).toBe(1)
    expect(at(new Date(Date.parse(run.updated_at) + 1000).toISOString())).toBe(0)
  })

  it('発生の古い順に並べる', () => {
    const times = expandWorkflowRuns(input()).map((event) => event.occurredAt)
    expect(times).toEqual(times.toSorted())
  })
})
