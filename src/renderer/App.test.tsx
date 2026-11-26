import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { appState, createFakeApi, githubEvent } from '../../test/support/fake-github-inbox-api'
import type { AppState } from '../shared/ipc-contract'
import { App, selectPage } from './App'
import { createMainStore } from './main-store/main-store'
import { MainStoreProvider } from './main-store/use-main-store'

async function renderApp(state: AppState, events = [githubEvent('IC_1', '2026-01-02T03:04:00Z')]) {
  const api = createFakeApi({ state, events })
  const store = createMainStore(api)
  render(
    <MainStoreProvider store={store}>
      <App />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return api
}

describe('出す画面の選び方（component-frontend.md 1.）', () => {
  it.each([
    ['キーチェーンの案内', appState({ auth: { status: 'keychain_notice' } }), 'keychain_notice'],
    ['サインインし直す', appState({ auth: { status: 'signing_in' } }), 'signing_in'],
    ['使い始めの案内を終えていない', appState({ onboardingRequired: true }), 'onboarding'],
    ['サインインしていない', appState({ auth: { status: 'signed_out' } }), 'onboarding'],
    ['それ以外', appState(), 'main'],
    [
      '認証が切れた（メインの上部に知らせを出す）',
      appState({ auth: { status: 'auth_failed', login: 'alice' } }),
      'main',
    ],
  ])('%s → %s', (_name, state, expected) => {
    expect(selectPage(state)).toBe(expected)
  })
})

describe('画面の殻', () => {
  it('読み込み中は読み込み中と出す', () => {
    const store = createMainStore(createFakeApi({ state: appState() }))
    render(
      <MainStoreProvider store={store}>
        <App />
      </MainStoreProvider>,
    )
    expect(screen.getByText('読み込み中')).toBeTruthy()
  })

  it('最初の値を取れなければ、開き直すように出す', async () => {
    const api = createFakeApi({ state: appState() })
    api.invoke = () => Promise.reject(new Error('internal'))
    const store = createMainStore(api)
    render(
      <MainStoreProvider store={store}>
        <App />
      </MainStoreProvider>,
    )
    await act(() => store.start())
    expect(screen.getByText('読み込めませんでした。アプリを開き直してください。')).toBeTruthy()
  })

  it('サインインしていなければ、使い始めの案内を出す', async () => {
    await renderApp(appState({ auth: { status: 'signed_out' }, onboardingRequired: true }))
    expect(screen.getByRole('heading', { name: '使い始めの案内' })).toBeTruthy()
  })

  it('保存済みの出来事を、種類・対象・リポジトリ・誰がとともに一覧に出す', async () => {
    await renderApp(appState())
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
    expect(screen.getByText('ログイン画面の文言を直す')).toBeTruthy()
    expect(screen.getByText('コメント')).toBeTruthy()
    expect(screen.getByText('example-org/app #101')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('bot の発言には印を付ける', async () => {
    await renderApp(appState(), [
      githubEvent('IC_1', '2026-01-02T03:04:00Z', { actor: { login: 'example-bot', isBot: true } }),
    ])
    expect(screen.getByText('bot')).toBeTruthy()
  })

  it('出来事が無ければ、無いことを出す', async () => {
    await renderApp(appState(), [])
    expect(screen.getByText('まだ出来事はありません')).toBeTruthy()
  })

  it('メインから出来事が届いたら一覧に足す', async () => {
    const api = await renderApp(appState(), [])
    act(() =>
      api.push('events:added', [
        githubEvent('IC_9', '2026-01-03T00:00:00Z', {
          target: {
            kind: 'issue',
            repository: 'example-org/api',
            number: 7,
            title: 'API のタイムアウトを延ばす',
            url: 'https://github.com/example-org/api/issues/7',
          },
        }),
      ]),
    )
    expect(screen.getByText('API のタイムアウトを延ばす')).toBeTruthy()
  })

  it('GitHub から取った文字は、HTML としてではなく文字として出す（S-05）', async () => {
    await renderApp(appState(), [
      githubEvent('IC_1', '2026-01-02T03:04:00Z', {
        target: {
          kind: 'pull_request',
          repository: 'example-org/app',
          number: 1,
          title: '<img src=x onerror=alert(1)>',
          url: 'https://github.com/example-org/app/pull/1',
        },
      }),
    ])
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('言語が英語なら英語で出す（F-26）', async () => {
    await renderApp(appState({}, { language: 'en' }))
    expect(screen.getByRole('heading', { name: 'Events' })).toBeTruthy()
    expect(screen.getByText('Comment')).toBeTruthy()
  })
})
