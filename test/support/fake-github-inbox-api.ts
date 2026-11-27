// 画面のテストで使う、preload の window.githubInbox の偽物
import {
  DEFAULT_SETTINGS,
  type GitHubEvent,
  type PullRequestItem,
  type Settings,
} from '../../src/shared/domain'
import type {
  AppState,
  GithubInboxApi,
  InvokeChannel,
  InvokeResult,
  PrListSnapshot,
  PushChannel,
  PushPayload,
} from '../../src/shared/ipc-contract'

export function appState(
  change: Partial<AppState> = {},
  settings: Partial<Settings> = {},
): AppState {
  return {
    appInfo: { version: '0.1.0', platform: 'darwin', inApplicationsFolder: true },
    auth: { status: 'signed_in', login: 'alice', method: 'pat' },
    ingest: { state: 'ok' },
    desktopNotification: {},
    settings: {
      ...DEFAULT_SETTINGS,
      onboarding: { completedAt: '2026-01-01T00:00:00Z' },
      ...settings,
    },
    loginItem: { enabled: false },
    onboardingRequired: false,
    prList: { loading: false },
    ...change,
  }
}

export function githubEvent(
  id: string,
  occurredAt: string,
  change: Partial<GitHubEvent> = {},
): GitHubEvent {
  return {
    id,
    type: 'comment',
    target: {
      kind: 'pull_request',
      repository: 'example-org/app',
      number: 101,
      title: 'ログイン画面の文言を直す',
      url: 'https://github.com/example-org/app/pull/101',
    },
    actor: { login: 'bob', isBot: false },
    occurredAt,
    url: `https://github.com/example-org/app/pull/101#${id}`,
    receivedAt: occurredAt,
    ...change,
  }
}

export function pullRequestItem(
  id: string,
  updatedAt: string,
  change: Partial<PullRequestItem> = {},
): PullRequestItem {
  return {
    id,
    repository: 'example-org/app',
    number: 101,
    title: 'ログイン画面の文言を直す',
    url: 'https://github.com/example-org/app/pull/101',
    state: 'open',
    author: { login: 'bob', isBot: false },
    updatedAt,
    waitingReasons: [],
    ...change,
  }
}

export function prListSnapshot(
  items: PullRequestItem[],
  change: Partial<PrListSnapshot> = {},
): PrListSnapshot {
  return { items, periodDays: 7, fetchedAt: '2026-01-31T00:00:00Z', ...change }
}

export interface FakeApi extends GithubInboxApi {
  /** メインからの知らせを送ったことにする */
  push<C extends PushChannel>(channel: C, payload: PushPayload<C>): void
  /** 呼ばれた順（受け取りの始めと依頼） */
  calls: string[]
  /** 頼まれたチャンネルと引数（受け取りの始めは含まない） */
  invocations: { channel: InvokeChannel; args: unknown }[]
  listeners(channel: PushChannel): number
}

/** 答え。Promise を渡すと、テストの中で答えるときを決められる */
export type FakeAnswers = { [C in InvokeChannel]?: InvokeResult<C> | Promise<InvokeResult<C>> }

const OK_VOID = { ok: true, value: undefined } as const

export function createFakeApi(responses: {
  state: AppState
  events?: GitHubEvent[]
  prList?: PrListSnapshot | null
  answers?: FakeAnswers
}): FakeApi {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const calls: string[] = []
  const invocations: FakeApi['invocations'] = []
  const answer: Partial<Record<InvokeChannel, unknown>> = {
    'app:getState': responses.state,
    'events:list': responses.events ?? [],
    'prs:get': responses.prList ?? null,
    'prs:reload':
      responses.prList === undefined || responses.prList === null
        ? { ok: false, error: { code: 'not_signed_in' } }
        : { ok: true, value: responses.prList },
    'settings:update': { ok: true, value: responses.state.settings },
    'loginItem:set': { ok: true, value: { enabled: !responses.state.loginItem.enabled } },
    'clipboard:copyLinks': { ok: true, value: { count: 0 } },
    'auth:submitPat': { ok: true, value: { login: 'alice' } },
    'auth:continueAfterKeychainNotice': OK_VOID,
    'auth:signOut': OK_VOID,
    'shell:openGitHub': OK_VOID,
    'os:openNotificationSettings': OK_VOID,
    'onboarding:moveToApplicationsFolder': OK_VOID,
    'onboarding:sendTestNotification': { ok: true, value: { outcome: 'shown' } },
    'onboarding:complete': OK_VOID,
    ...responses.answers,
  }
  return {
    calls,
    invocations,
    invoke: ((channel: InvokeChannel, args?: unknown) => {
      calls.push(`invoke:${channel}`)
      if (channel !== 'app:getState' && channel !== 'events:list' && channel !== 'prs:get') {
        invocations.push({ channel, args })
      }
      return Promise.resolve(answer[channel])
    }) as GithubInboxApi['invoke'],
    on: ((channel: PushChannel, listener: (payload: unknown) => void) => {
      calls.push(`on:${channel}`)
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
      return () => {
        set.delete(listener)
      }
    }) as GithubInboxApi['on'],
    push(channel, payload) {
      for (const listener of listeners.get(channel) ?? []) listener(payload)
    },
    listeners: (channel) => listeners.get(channel)?.size ?? 0,
  }
}
