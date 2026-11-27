import { describe, expect, it } from 'vitest'
import type { GitHubEvent, Language } from '../../shared/domain'
import { desktopNotificationText } from './desktop-notification-text'

function event(change: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    id: 'IC_1',
    type: 'comment',
    target: {
      kind: 'pull_request',
      repository: 'example-org/app',
      number: 101,
      title: 'ログイン画面の文言を直す',
      url: 'https://github.com/example-org/app/pull/101',
    },
    actor: { login: 'bob', isBot: false },
    occurredAt: '2026-01-31T12:00:00Z',
    url: 'https://github.com/example-org/app/pull/101#issuecomment-1',
    receivedAt: '2026-01-31T12:00:00Z',
    ...change,
  }
}

const workflowRun: GitHubEvent['target'] = {
  kind: 'workflow_run',
  repository: 'alice/tools',
  title: 'CI: 文言を直す（main）',
  url: 'https://github.com/alice/tools/actions/runs/1',
}

// component-backend.md 5.4: タイトルは「種類・リポジトリ」、本文は「誰が・対象のタイトル」。抜粋は出さない
describe('デスクトップ通知の文言（component-backend.md 5.4）', () => {
  it.each([
    [
      'コメント（日本語）',
      event(),
      'ja',
      { title: 'コメント · example-org/app #101', body: 'bob: ログイン画面の文言を直す' },
    ],
    [
      'コメント（英語）',
      event(),
      'en',
      { title: 'Comment · example-org/app #101', body: 'bob: ログイン画面の文言を直す' },
    ],
    [
      'レビューは結果を添える',
      event({ type: 'review', reviewResult: 'changes_requested' }),
      'ja',
      {
        title: 'レビュー（修正依頼） · example-org/app #101',
        body: 'bob: ログイン画面の文言を直す',
      },
    ],
    [
      'レビューの結果（英語）',
      event({ type: 'review', reviewResult: 'approved' }),
      'en',
      { title: 'Review (Approved) · example-org/app #101', body: 'bob: ログイン画面の文言を直す' },
    ],
    [
      'CI の結果は GitHub の値のまま添え、番号の無い対象はリポジトリだけ',
      event({ type: 'ci', ciConclusion: 'failure', target: workflowRun }),
      'ja',
      { title: 'CI の結果（failure） · alice/tools', body: 'bob: CI: 文言を直す（main）' },
    ],
    [
      'CI の結果（英語）',
      event({ type: 'ci', ciConclusion: 'success', target: workflowRun }),
      'en',
      { title: 'CI result (success) · alice/tools', body: 'bob: CI: 文言を直す（main）' },
    ],
    [
      '抜粋は出さない',
      event({ type: 'mention', excerpt: '@alice 見てください' }),
      'ja',
      { title: 'メンション · example-org/app #101', body: 'bob: ログイン画面の文言を直す' },
    ],
  ] satisfies [string, GitHubEvent, Language, { title: string; body: string }][])(
    '%s',
    (_name, input, language, expected) => {
      expect(desktopNotificationText(input, language)).toEqual(expected)
    },
  )
})
