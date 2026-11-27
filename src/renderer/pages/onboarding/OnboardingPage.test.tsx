import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appState,
  createFakeApi,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import type { AppState } from '../../../shared/ipc-contract'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider } from '../../main-store/use-main-store'
import { OnboardingPage } from './OnboardingPage'

afterEach(cleanup)

/** 初めての案内（サインインした後。手順2はサインインしているアカウントを出す） */
const firstRun = (appInfo: Partial<AppState['appInfo']> = {}) =>
  appState({
    onboardingRequired: true,
    appInfo: { version: '0.1.0', platform: 'darwin', inApplicationsFolder: true, ...appInfo },
  })

async function renderPage(
  state: AppState,
  answers: FakeAnswers = {},
  props: { again?: boolean } = {},
) {
  const api = createFakeApi({ state, answers })
  const store = createMainStore(api)
  let finished = 0
  render(
    <MainStoreProvider store={store}>
      <OnboardingPage
        again={props.again ?? false}
        onFinished={() => {
          finished += 1
        }}
      />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return Object.assign(api, { finished: () => finished })
}

const heading = (name: string) => screen.getByRole('heading', { name })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))

// component-frontend.md 3.
describe('手順の並び', () => {
  it('Mac でアプリケーションフォルダの外なら、手順1（移す）から始める', async () => {
    await renderPage(firstRun({ inApplicationsFolder: false }))
    expect(heading('アプリケーションフォルダへ移す')).toBeTruthy()
    expect(screen.getByText('手順 1 / 5')).toBeTruthy()
  })

  it.each([
    ['Mac でアプリケーションフォルダの中', firstRun()],
    ['Windows', firstRun({ platform: 'win32', inApplicationsFolder: null })],
  ])('%s なら、手順2（サインイン）から始める', async (_name, state) => {
    await renderPage(state)
    expect(heading('GitHub でサインイン')).toBeTruthy()
    expect(screen.getByText('手順 1 / 4')).toBeTruthy()
    // 最初の手順には戻るボタンが無い
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
  })

  it('設定から開き直したときは、サインインを飛ばす', async () => {
    await renderPage(firstRun({ inApplicationsFolder: false }), {}, { again: true })
    expect(screen.getByText('手順 1 / 4')).toBeTruthy()
    await click('あとで')
    expect(heading('GitHub の通知設定を確かめる')).toBeTruthy()
    // 手順3からは、その前の手順1に戻れる
    await click('戻る')
    expect(heading('アプリケーションフォルダへ移す')).toBeTruthy()
  })

  it('英語のときは英語で出す（F-26）', async () => {
    await renderPage(appState({ onboardingRequired: true }, { language: 'en' }))
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 4')).toBeTruthy()
  })
})

// F-36 (1)、AC-41
describe('手順1: アプリケーションフォルダへ移す', () => {
  it('「アプリケーションフォルダに移して開き直す」で移すよう頼む', async () => {
    const api = await renderPage(firstRun({ inApplicationsFolder: false }))
    await click('アプリケーションフォルダに移して開き直す')
    expect(api.invocations).toEqual([
      { channel: 'onboarding:moveToApplicationsFolder', args: undefined },
    ])
  })

  it('移せなければ、手で移す方法を出す', async () => {
    await renderPage(firstRun({ inApplicationsFolder: false }), {
      'onboarding:moveToApplicationsFolder': { ok: false, error: { code: 'internal' } },
    })
    await click('アプリケーションフォルダに移して開き直す')
    expect(screen.getByRole('alert').textContent).toContain(
      'Finder で github-inbox をアプリケーションフォルダにドラッグ',
    )
  })

  it('「あとで」で次の手順に進む。知らせが残ることを先に伝える', async () => {
    await renderPage(firstRun({ inApplicationsFolder: false }))
    expect(screen.getByText(/画面の上に知らせが出ます/)).toBeTruthy()
    await click('あとで')
    expect(heading('GitHub でサインイン')).toBeTruthy()
    expect(screen.getByText('手順 2 / 5')).toBeTruthy()
  })
})

// F-36 (2)
describe('手順2: サインイン', () => {
  it('サインインしていなければ PAT の貼り付けを出す。手順1があれば戻れる', async () => {
    await renderPage(
      appState({
        auth: { status: 'signed_out' },
        onboardingRequired: true,
        appInfo: { version: '0.1.0', platform: 'darwin', inApplicationsFolder: false },
      }),
    )
    await click('あとで')
    expect(screen.getByLabelText('トークン')).toBeTruthy()
    await click('戻る')
    expect(heading('アプリケーションフォルダへ移す')).toBeTruthy()
  })

  it('サインインしていれば、アカウントと「次へ」を出す', async () => {
    await renderPage(firstRun())
    expect(screen.getByText('alice')).toBeTruthy()
    await click('次へ')
    expect(heading('GitHub の通知設定を確かめる')).toBeTruthy()
  })
})

// F-36 (3)
describe('手順3: GitHub の通知設定', () => {
  async function atStep3(answers: FakeAnswers = {}) {
    const api = await renderPage(firstRun(), answers)
    await click('次へ')
    return api
  }

  it('確かめる項目を出し、設定ページを開ける。開いたら「次へ」になる', async () => {
    const api = await atStep3()
    expect(screen.getByText(/Only notify for failed workflows/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '飛ばす' })).toBeTruthy()

    await click('GitHub の通知設定を開く')
    expect(api.invocations.at(-1)).toEqual({
      channel: 'shell:openGitHub',
      args: { url: 'https://github.com/settings/notifications' },
    })
    expect(screen.queryByRole('button', { name: '飛ばす' })).toBeNull()
    await click('次へ')
    expect(heading('試しのデスクトップ通知')).toBeTruthy()
  })

  it('開けなければ理由を出し、「飛ばす」のまま', async () => {
    await atStep3({ 'shell:openGitHub': { ok: false, error: { code: 'url_not_allowed' } } })
    await click('GitHub の通知設定を開く')
    expect(screen.getByRole('alert').textContent).toBe(
      'GitHub のページを開けませんでした。もう一度押してください。',
    )
    expect(screen.getByRole('button', { name: '飛ばす' })).toBeTruthy()
  })

  it('飛ばせる。戻ると手順2', async () => {
    await atStep3()
    await click('飛ばす')
    expect(heading('試しのデスクトップ通知')).toBeTruthy()
    await click('戻る')
    await click('戻る')
    expect(heading('GitHub でサインイン')).toBeTruthy()
  })
})

// F-36 (4)、N-09、AC-38、D-033
describe('手順4: 試しのデスクトップ通知', () => {
  async function atStep4(state: AppState = firstRun(), answers: FakeAnswers = {}) {
    const api = await renderPage(state, answers)
    await click('次へ')
    await click('飛ばす')
    return api
  }
  const sendTest = () => click('試しのデスクトップ通知を出す')

  it('Mac では、出たと知らされても表示されたかを聞く。「表示された」で「次へ」になる', async () => {
    const api = await atStep4(firstRun(), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'shown' } },
    })
    expect(screen.getByRole('button', { name: '飛ばす' })).toBeTruthy()
    await sendTest()
    expect(api.invocations.at(-1)).toEqual({
      channel: 'onboarding:sendTestNotification',
      args: undefined,
    })
    expect(screen.getByText('デスクトップ通知が表示されましたか？')).toBeTruthy()

    await click('表示された')
    expect(screen.getByText('デスクトップ通知が出ることを確かめました。')).toBeTruthy()
    await click('次へ')
    expect(heading('準備ができました')).toBeTruthy()
  })

  it('Windows で出たと知らされたら、聞かずに確かめたことにする', async () => {
    await atStep4(firstRun({ platform: 'win32', inApplicationsFolder: null }), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'shown' } },
    })
    await sendTest()
    expect(screen.queryByText('デスクトップ通知が表示されましたか？')).toBeNull()
    expect(screen.getByText('デスクトップ通知が出ることを確かめました。')).toBeTruthy()
  })

  it('分からなければ（unknown）表示されたかを聞く', async () => {
    await atStep4(firstRun({ platform: 'win32', inApplicationsFolder: null }), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'unknown' } },
    })
    await sendTest()
    expect(screen.getByText('デスクトップ通知が表示されましたか？')).toBeTruthy()
  })

  it('「表示されなかった」なら、直し方と OS の通知の設定を開くボタンを出す。「飛ばす」のまま', async () => {
    const api = await atStep4()
    await sendTest()
    await click('表示されなかった')
    expect(screen.getByText(/github-inbox の通知を許可してください/)).toBeTruthy()
    await click('OS の通知の設定を開く')
    expect(api.invocations.at(-1)).toEqual({
      channel: 'os:openNotificationSettings',
      args: undefined,
    })
    expect(screen.getByRole('button', { name: '飛ばす' })).toBeTruthy()
  })

  it('OS が断った（failed）なら、聞かずに直し方を出す', async () => {
    await atStep4(firstRun(), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'failed' } },
    })
    await sendTest()
    expect(screen.queryByText('デスクトップ通知が表示されましたか？')).toBeNull()
    expect(screen.getByRole('button', { name: 'OS の通知の設定を開く' })).toBeTruthy()
  })

  it('アプリケーションフォルダの外なら、直し方は移すこと', async () => {
    const api = await renderPage(firstRun({ inApplicationsFolder: false }), {
      'onboarding:sendTestNotification': { ok: true, value: { outcome: 'failed' } },
    })
    await click('あとで')
    await click('次へ')
    await click('飛ばす')
    await sendTest()
    expect(screen.getByText(/アプリケーションフォルダの外から開いているため/)).toBeTruthy()
    await click('アプリケーションフォルダに移して開き直す')
    expect(api.invocations.at(-1)).toEqual({
      channel: 'onboarding:moveToApplicationsFolder',
      args: undefined,
    })
  })

  it('出せなければ理由を出す', async () => {
    await atStep4(firstRun(), {
      'onboarding:sendTestNotification': { ok: false, error: { code: 'internal' } },
    })
    await sendTest()
    expect(screen.getByRole('alert').textContent).toBe(
      '試しのデスクトップ通知を出せませんでした。もう一度押してください。',
    )
  })

  it('もう一度出せる', async () => {
    const api = await atStep4()
    await sendTest()
    await click('もう一度出す')
    expect(
      api.invocations.filter((call) => call.channel === 'onboarding:sendTestNotification'),
    ).toHaveLength(2)
  })
})

// F-36、F-25
describe('手順5: 終わり', () => {
  async function atStep5(answers: FakeAnswers = {}, props: { again?: boolean } = {}) {
    const api = await renderPage(firstRun(), answers, props)
    if (props.again !== true) await click('次へ')
    await click('飛ばす')
    await click('飛ばす')
    return api
  }

  it('自動起動を切り替えられる。戻るボタンは無い', async () => {
    const api = await atStep5()
    expect(heading('準備ができました')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'ログインしたときに立ち上げる' }))
    expect(api.invocations.at(-1)).toEqual({ channel: 'loginItem:set', args: { enabled: true } })
  })

  it('自動起動を切り替えられなければ理由を出す', async () => {
    await atStep5({ 'loginItem:set': { ok: false, error: { code: 'internal' } } })
    await userEvent.click(screen.getByRole('switch', { name: 'ログインしたときに立ち上げる' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '自動起動を切り替えられませんでした。もう一度押してください。',
    )
  })

  it('「使い始める」で案内を終えるよう頼む', async () => {
    const api = await atStep5()
    await click('使い始める')
    expect(api.invocations.at(-1)).toEqual({ channel: 'onboarding:complete', args: undefined })
    // 初めての案内は、届いた状態でメインの画面に切り替わる（App）
    expect(api.finished()).toBe(0)
  })

  it('終えられなければ理由を出す', async () => {
    await atStep5({ 'onboarding:complete': { ok: false, error: { code: 'not_signed_in' } } })
    await click('使い始める')
    expect(screen.getByRole('alert').textContent).toBe('進めませんでした。もう一度押してください。')
  })

  it('開き直した案内は、終えたら閉じる', async () => {
    const api = await atStep5({}, { again: true })
    await click('使い始める')
    expect(api.finished()).toBe(1)
  })
})
