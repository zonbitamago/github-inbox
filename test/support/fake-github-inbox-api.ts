// 画面のテストで使う、preload の window.githubInbox の偽物
import { DEFAULT_SETTINGS, type GitHubEvent, type Settings } from '../../src/shared/domain'
import type {
  AppState,
  GithubInboxApi,
  InvokeChannel,
  PushChannel,
  PushPayload,
} from '../../src/shared/ipc-contract'

export function appState(
  change: Partial<AppState> = {},
  settings: Partial<Settings> = {},
): AppState {
  return {
    appInfo: { version: '0.1.0', platform: 'darwin', inApplicationsFolder: true },
    auth: { status: 'signed_in', login: 'alice', method: 'device_flow' },
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

export interface FakeApi extends GithubInboxApi {
  /** メインからの知らせを送ったことにする */
  push<C extends PushChannel>(channel: C, payload: PushPayload<C>): void
  /** 呼ばれた順（受け取りの始めと依頼） */
  calls: string[]
  listeners(channel: PushChannel): number
}

export function createFakeApi(responses: { state: AppState; events?: GitHubEvent[] }): FakeApi {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const calls: string[] = []
  const answer: Partial<Record<InvokeChannel, unknown>> = {
    'app:getState': responses.state,
    'events:list': responses.events ?? [],
    'prs:get': null,
  }
  return {
    calls,
    invoke: ((channel: InvokeChannel) => {
      calls.push(`invoke:${channel}`)
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
