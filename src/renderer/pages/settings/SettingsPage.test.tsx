import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appState,
  createFakeApi,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import { DEFAULT_SETTINGS } from '../../../shared/domain'
import type { AppState } from '../../../shared/ipc-contract'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider } from '../../main-store/use-main-store'
import { SettingsPage } from './SettingsPage'

afterEach(cleanup)

async function renderPage(state: AppState = appState(), answers: FakeAnswers = {}) {
  const api = createFakeApi({ state, answers })
  const store = createMainStore(api)
  let closed = 0
  let restarted = 0
  render(
    <MainStoreProvider store={store}>
      <SettingsPage
        onClose={() => {
          closed += 1
        }}
        onRestartOnboarding={() => {
          restarted += 1
        }}
      />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return Object.assign(api, { closed: () => closed, restarted: () => restarted })
}

const section = (name: string) => screen.getByRole('region', { name })

describe('設定の画面（component-frontend.md 2.1）', () => {
  it('「戻る」と Esc でメインの画面に戻る', async () => {
    const api = await renderPage()
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    await userEvent.keyboard('{Escape}')
    expect(api.closed()).toBe(2)
  })

  it('変えたらすぐ頼み、保存ボタンは無い（component-frontend.md 4.）', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull()
  })

  it('保存できなければ理由を出す', async () => {
    await renderPage(appState(), {
      'settings:update': { ok: false, error: { code: 'internal' } },
    })
    await userEvent.click(screen.getByRole('switch', { name: 'CI の結果' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '設定を保存できませんでした。もう一度変えてください。',
    )
  })

  it('メインから届いた設定で出す（変えた値は push で戻ってくる）', async () => {
    const api = await renderPage()
    expect(screen.getByRole('switch', { name: 'CI の結果' })).toHaveProperty('checked', true)
    act(() =>
      api.push(
        'state:changed',
        appState(
          {},
          {
            desktopNotification: {
              ...DEFAULT_SETTINGS.desktopNotification,
              byType: { ...DEFAULT_SETTINGS.desktopNotification.byType, ci: false },
            },
          },
        ),
      ),
    )
    expect(screen.getByRole('switch', { name: 'CI の結果' })).toHaveProperty('checked', false)
  })
})

// F-09、AC-09・10
describe('デスクトップ通知（F-09）', () => {
  it('出来事の種類ごとと bot の発言を切り替えられ、丸ごと送る（ipc-contract.md 2.）', async () => {
    const api = await renderPage()
    // 出来事の種類7つと bot の発言
    expect(within(section('デスクトップ通知')).getAllByRole('switch')).toHaveLength(8)

    await userEvent.click(screen.getByRole('switch', { name: 'CI の結果' }))
    await userEvent.click(screen.getByRole('switch', { name: 'bot の発言' }))
    expect(api.invocations).toEqual([
      {
        channel: 'settings:update',
        args: {
          desktopNotification: {
            byType: { ...DEFAULT_SETTINGS.desktopNotification.byType, ci: false },
            bots: true,
          },
        },
      },
      {
        channel: 'settings:update',
        args: { desktopNotification: { ...DEFAULT_SETTINGS.desktopNotification, bots: false } },
      },
    ])
  })
})

// F-16・F-32・F-33、AC-19・34・35
describe('一覧（F-16・F-32・F-33）', () => {
  it('日数は1〜30日から選べる（0日・31日は選べない。AC-19）', async () => {
    await renderPage()
    const options = within(screen.getByRole('combobox', { name: 'PR の一覧の期間' }))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toHaveLength(30)
    expect(options[0]).toBe('1 日')
    expect(options.at(-1)).toBe('30 日')
  })

  it.each([
    ['出来事の一覧の日数', '3 日', { eventDays: 3 }],
    ['PR の一覧の期間', '30 日', { prPeriodDays: 30 }],
    ['並べ方', '左右に並べる', { layout: 'side_by_side' }],
  ])('%s を変えたら、その値だけを送る', async (name, option, patch) => {
    const api = await renderPage()
    await userEvent.selectOptions(screen.getByRole('combobox', { name }), option)
    expect(api.invocations).toEqual([{ channel: 'settings:update', args: patch }])
  })

  it('今の値を選んである', async () => {
    await renderPage(appState({}, { eventDays: 14, prPeriodDays: 30, layout: 'side_by_side' }))
    expect(screen.getByRole('combobox', { name: '出来事の一覧の日数' })).toHaveProperty(
      'value',
      '14',
    )
    expect(screen.getByRole('combobox', { name: 'PR の一覧の期間' })).toHaveProperty('value', '30')
    expect(screen.getByRole('combobox', { name: '並べ方' })).toHaveProperty('value', 'side_by_side')
  })
})

// F-35、AC-44。CR-012
describe('画面の配色（F-35）', () => {
  it('既定は「OS に合わせる」。ダークを選ぶと送る', async () => {
    const api = await renderPage()
    const select = screen.getByRole('combobox', { name: '画面の配色' })
    expect(select).toHaveProperty('value', 'system')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['OS に合わせる', 'ライト', 'ダーク'])
    await userEvent.selectOptions(select, 'ダーク')
    expect(api.invocations).toEqual([{ channel: 'settings:update', args: { appearance: 'dark' } }])
  })

  it('保存してある配色を選んだ状態で出す', async () => {
    await renderPage(appState({}, { appearance: 'light' }))
    expect(screen.getByRole('combobox', { name: '画面の配色' })).toHaveProperty('value', 'light')
  })
})

// F-26、AC-28
describe('言語（F-26）', () => {
  it('英語を選ぶと送る。言語の名前はその言語で出す', async () => {
    const api = await renderPage()
    const select = screen.getByRole('combobox', { name: '表示言語' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['日本語', 'English'])
    await userEvent.selectOptions(select, 'English')
    expect(api.invocations).toEqual([{ channel: 'settings:update', args: { language: 'en' } }])
  })

  it('英語のときは画面の文言が英語になる', async () => {
    await renderPage(appState({}, { language: 'en' }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'CI result' })).toBeTruthy()
  })
})

// F-25、AC-27
describe('自動起動（F-25）', () => {
  it('切り替えるとメインに頼む。出すのはメインが読み直した値', async () => {
    const api = await renderPage()
    const toggle = screen.getByRole('switch', { name: 'ログインしたときに立ち上げる' })
    expect(toggle).toHaveProperty('checked', false)
    await userEvent.click(toggle)
    expect(api.invocations).toEqual([{ channel: 'loginItem:set', args: { enabled: true } }])

    act(() => api.push('state:changed', appState({ loginItem: { enabled: true } })))
    expect(toggle).toHaveProperty('checked', true)
  })

  it('切り替えられなければ理由を出す', async () => {
    await renderPage(appState(), { 'loginItem:set': { ok: false, error: { code: 'internal' } } })
    await userEvent.click(screen.getByRole('switch', { name: 'ログインしたときに立ち上げる' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '自動起動を切り替えられませんでした。もう一度押してください。',
    )
  })
})

// F-28、auth-flow.md 6.
describe('アカウント（F-28）', () => {
  it('サインインしているユーザー名を出す', async () => {
    await renderPage()
    const account = within(section('アカウント')).getByText('サインインしているアカウント')
    expect(account.nextElementSibling?.textContent).toBe('alice')
  })

  it('サインアウトは一度確かめてから頼む。「やめる」で戻る', async () => {
    const api = await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    expect(section('アカウント').textContent).toContain(
      'この PC に保存したトークンと出来事を消します',
    )
    expect(api.invocations).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(screen.queryByRole('button', { name: 'サインアウトする' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await userEvent.click(screen.getByRole('button', { name: 'サインアウトする' }))
    expect(api.invocations).toEqual([{ channel: 'auth:signOut', args: undefined }])
  })

  it('サインアウトできなければ理由を出す', async () => {
    await renderPage(appState(), { 'auth:signOut': { ok: false, error: { code: 'internal' } } })
    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await userEvent.click(screen.getByRole('button', { name: 'サインアウトする' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'サインアウトできませんでした。もう一度押してください。',
    )
  })

  it('GitHub 側のトークンの取り消しを勧め、トークンの設定ページを開ける', async () => {
    const api = await renderPage()
    expect(section('アカウント').textContent).toContain('GitHub 側では使えるまま')
    await userEvent.click(screen.getByRole('button', { name: 'GitHub のトークンの設定を開く' }))
    expect(api.invocations).toEqual([
      { channel: 'shell:openGitHub', args: { url: 'https://github.com/settings/tokens' } },
    ])
  })

  it('トークンの設定ページを開けなければ理由を出す', async () => {
    await renderPage(appState(), {
      'shell:openGitHub': { ok: false, error: { code: 'url_not_allowed' } },
    })
    await userEvent.click(screen.getByRole('button', { name: 'GitHub のトークンの設定を開く' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'GitHub のページを開けませんでした。もう一度押してください。',
    )
  })
})

// D-033、AC-38。component-frontend.md 2.1（⑭ S6b）
describe('デスクトップ通知が出ないとき', () => {
  it('試しのデスクトップ通知を出せる。Mac では出たと知らされても、表示されたかを聞く', async () => {
    const api = await renderPage(appState(), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'shown' } },
    })
    const help = section('デスクトップ通知が出ないとき')
    await userEvent.click(
      within(help).getByRole('button', { name: '試しのデスクトップ通知を出す' }),
    )
    expect(api.invocations).toEqual([
      { channel: 'onboarding:sendTestNotification', args: undefined },
    ])
    expect(help.textContent).toContain('デスクトップ通知が表示されましたか？')
  })

  it('「表示されなかった」なら、直し方と OS の通知の設定を開くボタンを出す', async () => {
    const api = await renderPage(appState(), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'shown' } },
    })
    const help = section('デスクトップ通知が出ないとき')
    await userEvent.click(
      within(help).getByRole('button', { name: '試しのデスクトップ通知を出す' }),
    )
    await userEvent.click(within(help).getByRole('button', { name: '表示されなかった' }))
    expect(help.textContent).toContain('github-inbox の通知を許可してください')
    await userEvent.click(within(help).getByRole('button', { name: 'OS の通知の設定を開く' }))
    expect(api.invocations.at(-1)).toEqual({
      channel: 'os:openNotificationSettings',
      args: undefined,
    })
  })
})

// component-frontend.md 3.（⑭ S6b）
describe('使い始めの案内（もう一度）', () => {
  it('「使い始めの案内をもう一度」で開き直す', async () => {
    const api = await renderPage()
    await userEvent.click(screen.getByRole('button', { name: '使い始めの案内をもう一度' }))
    expect(api.restarted()).toBe(1)
  })
})
