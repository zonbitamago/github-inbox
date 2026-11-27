import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appState,
  createFakeApi,
  githubEvent,
  type FakeAnswers,
} from '../../test/support/fake-github-inbox-api'
import type { AppState } from '../shared/ipc-contract'
import { App, selectPage } from './App'
import { createMainStore } from './main-store/main-store'
import { MainStoreProvider } from './main-store/use-main-store'

// 描いた画面をテストごとに片付ける（vitest の globals を使っていないため、自動では片付かない）
afterEach(cleanup)

async function renderApp(
  state: AppState,
  events = [githubEvent('IC_1', '2026-01-02T03:04:00Z')],
  answers: FakeAnswers = {},
) {
  const api = createFakeApi({ state, events, answers })
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

  it.each([
    ['設定を開いている', appState(), 'settings'],
    [
      '設定を開いていても、サインインしていなければ案内',
      appState({ auth: { status: 'signed_out' } }),
      'onboarding',
    ],
    [
      '設定を開いていても、キーチェーンの案内が先',
      appState({ auth: { status: 'keychain_notice' } }),
      'keychain_notice',
    ],
  ])('%s → %s', (_name, state, expected) => {
    expect(selectPage(state, true)).toBe(expected)
  })

  it.each([
    ['使い始めの案内を開き直している', appState(), 'onboarding_again'],
    [
      '開き直していても、サインインしていなければ初めからの案内',
      appState({ auth: { status: 'signed_out' } }),
      'onboarding',
    ],
  ])('%s → %s', (_name, state, expected) => {
    expect(selectPage(state, false, true)).toBe(expected)
  })
})

// component-frontend.md 1.・4.（設定を開いているかは画面の中だけの状態）
describe('設定の画面を開く・閉じる', () => {
  it('「設定」で開き、「戻る」でメインの画面に戻る', async () => {
    await renderApp(appState())
    await userEvent.click(screen.getByRole('button', { name: '設定' }))
    expect(screen.getByRole('heading', { name: '設定', level: 1 })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByRole('tablist')).toBeTruthy()
  })

  it('Cmd+, で開き、Esc で戻る', async () => {
    await renderApp(appState())
    await userEvent.keyboard('{Meta>},{/Meta}')
    expect(screen.getByRole('heading', { name: '設定', level: 1 })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('heading', { name: '設定', level: 1 })).toBeNull()
  })

  it('デスクトップ通知がクリックされたら、設定を閉じて出来事を強調する（F-08）', async () => {
    const api = await renderApp(appState())
    await userEvent.click(screen.getByRole('button', { name: '設定' }))
    act(() => api.push('ui:focusEvent', { eventId: 'IC_1' }))
    const emphasized = within(screen.getByRole('list'))
      .getAllByRole('button')
      .find((row) => row.getAttribute('aria-current') === 'true')
    expect(emphasized?.textContent).toContain('ログイン画面')
  })

  it('設定からサインアウトしたら案内に移り、サインインし直したら設定ではなくメインの画面に戻る', async () => {
    const api = await renderApp(appState())
    await userEvent.click(screen.getByRole('button', { name: '設定' }))
    act(() => api.push('state:changed', appState({ auth: { status: 'signed_out' } })))
    expect(screen.getByRole('heading', { name: '使い始めの案内' })).toBeTruthy()
    act(() => api.push('state:changed', appState()))
    expect(screen.getByRole('tablist')).toBeTruthy()
  })
})

// component-frontend.md 3.（⑭ S6b）
describe('使い始めの案内をもう一度', () => {
  async function openAgain() {
    const api = await renderApp(appState())
    await userEvent.click(screen.getByRole('button', { name: '設定' }))
    await userEvent.click(screen.getByRole('button', { name: '使い始めの案内をもう一度' }))
    return api
  }

  it('設定から開き直すと、サインインを飛ばした案内を出す', async () => {
    await openAgain()
    expect(screen.getByRole('heading', { name: '使い始めの案内' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'GitHub の通知設定を確かめる' })).toBeTruthy()
    expect(screen.getByText('手順 1 / 3')).toBeTruthy()
  })

  it('終えたら、設定ではなくメインの画面に戻る', async () => {
    const api = await openAgain()
    await userEvent.click(screen.getByRole('button', { name: '飛ばす' }))
    await userEvent.click(screen.getByRole('button', { name: '飛ばす' }))
    await userEvent.click(screen.getByRole('button', { name: '使い始める' }))
    expect(api.invocations.at(-1)).toEqual({ channel: 'onboarding:complete', args: undefined })
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
  })

  it('デスクトップ通知がクリックされたら、案内を閉じて出来事の一覧に戻る（F-08）', async () => {
    const api = await openAgain()
    act(() => api.push('ui:focusEvent', { eventId: 'IC_1' }))
    expect(screen.queryByRole('heading', { name: '使い始めの案内' })).toBeNull()
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
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
    // 絞り込みの選択肢にも種類の名前があるので、一覧の中で探す
    const list = within(screen.getByRole('list'))
    expect(list.getByText('ログイン画面の文言を直す')).toBeTruthy()
    expect(list.getByText('コメント')).toBeTruthy()
    expect(list.getByText('example-org/app #101')).toBeTruthy()
    expect(list.getByText('bob')).toBeTruthy()
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
    expect(within(screen.getByRole('list')).getByText('Comment')).toBeTruthy()
  })
})

describe('認証の画面（S2。component-frontend.md 1.・3.、auth-flow.md 4.）', () => {
  it('キーチェーンの案内で「許可」を押すよう出し、「続ける」で読み出しを頼む（F-36 (5)）', async () => {
    const api = await renderApp(appState({ auth: { status: 'keychain_notice' } }))
    expect(screen.getByRole('heading', { name: '新しい版を入れました' })).toBeTruthy()
    expect(screen.getByText(/「許可」を押してください/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(api.invocations).toEqual([
      { channel: 'auth:continueAfterKeychainNotice', args: undefined },
    ])
  })

  it('キーチェーンの案内で続けられなければ、その旨を出す', async () => {
    await renderApp(appState({ auth: { status: 'keychain_notice' } }), [], {
      'auth:continueAfterKeychainNotice': { ok: false, error: { code: 'internal' } },
    })
    await userEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '続けられませんでした。もう一度押してください。',
    )
  })

  it('サインインし直す画面では、サインインの手順だけを出す（DR-18）', async () => {
    await renderApp(appState({ auth: { status: 'signing_in' } }))
    expect(screen.getByRole('heading', { name: 'GitHub にサインインし直す' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '使い始めの案内' })).toBeNull()
  })

  it('サインインしていなければ、使い始めの案内の手順2（サインイン）を出す', async () => {
    await renderApp(appState({ auth: { status: 'signed_out' }, onboardingRequired: true }))
    expect(screen.getByRole('heading', { name: 'GitHub でサインイン' })).toBeTruthy()
  })

  it('サインインできたら、手順3（GitHub の通知設定）に進む', async () => {
    await renderApp(appState({ auth: { status: 'signed_out' }, onboardingRequired: true }))
    await userEvent.type(screen.getByLabelText('トークン'), 'test-token-not-real')
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByRole('heading', { name: 'GitHub の通知設定を確かめる' })).toBeTruthy()
  })

  it('案内を終えたら、届いた状態でメインの画面に切り替わる', async () => {
    const api = await renderApp(
      appState({
        auth: { status: 'signed_in', login: 'alice', method: 'pat' },
        onboardingRequired: true,
      }),
    )
    act(() => api.push('state:changed', appState()))
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
  })
})
