import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appState,
  createFakeApi,
  githubEvent,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import type { AppState } from '../../../shared/ipc-contract'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider } from '../../main-store/use-main-store'
import { MainPage } from './MainPage'

afterEach(cleanup)

const events = [githubEvent('IC_1', '2026-01-02T03:04:00Z')]
const AUTH_FAILED = appState({
  auth: { status: 'auth_failed', login: 'alice', method: 'pat' },
  ingest: { state: 'auth_failed', lastSuccessAt: '2026-01-02T03:00:00Z' },
})

async function renderPage(state: AppState, answers: FakeAnswers = {}) {
  const api = createFakeApi({ state, events, answers })
  const store = createMainStore(api)
  render(
    <MainStoreProvider store={store}>
      <MainPage events={events} />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return api
}

// N-08、AC-14、component-frontend.md 2.2 の IngestStatusBanner
describe('受け取れていないことの知らせ（N-08、AC-14）', () => {
  it.each([
    ['取り込み中', { state: 'syncing' }, '出来事を取り込んでいます。'],
    ['つながらない', { state: 'offline' }, /GitHub につながらないため/],
    ['GitHub の障害', { state: 'github_error' }, /GitHub の障害のため/],
    [
      '利用制限（再開する時刻も出す）',
      { state: 'rate_limited', retryAt: '2026-01-02T03:30:00Z' },
      /利用制限にかかったため.*再開する時刻/,
    ],
  ] satisfies [string, AppState['ingest'], string | RegExp][])(
    '%s の理由を出す',
    async (_name, ingest, text) => {
      await renderPage(appState({ ingest }))
      expect(screen.getByRole('status').textContent).toMatch(text)
      expect(screen.queryByRole('button', { name: 'サインインし直す' })).toBeNull()
    },
  )

  it('受け取れていれば知らせを出さない（受け取れるようになったら消える）', async () => {
    const api = await renderPage(appState({ ingest: { state: 'offline' } }))
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => api.push('state:changed', appState({ ingest: { state: 'ok' } })))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('認証が切れたら、理由・最後に受け取った時刻と「サインインし直す」を出す', async () => {
    await renderPage(AUTH_FAILED)
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/GitHub の認証が切れたため.*最後に受け取った時刻/)
    expect(screen.getByRole('button', { name: 'サインインし直す' })).toBeTruthy()
  })
})

// CR-008: 帯の「サインインし直す」は、画面の中だけの状態で PAT の貼り付けを出す
describe('サインインし直す（CR-008、auth-flow.md 5.）', () => {
  it('押すと PAT の貼り付けを出し、「戻る」で出来事の一覧に戻る。メインには何も頼まない', async () => {
    const api = await renderPage(AUTH_FAILED)
    await userEvent.click(screen.getByRole('button', { name: 'サインインし直す' }))
    expect(screen.getByRole('heading', { name: 'GitHub にサインインし直す' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '出来事' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '出来事の一覧に戻る' }))
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
    expect(api.invocations).toEqual([])
  })

  it('サインインできたら、出来事の一覧に戻る', async () => {
    const api = await renderPage(AUTH_FAILED)
    await userEvent.click(screen.getByRole('button', { name: 'サインインし直す' }))
    await userEvent.type(screen.getByLabelText('トークン'), 'test-token-not-real')
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))

    expect(api.invocations).toEqual([
      { channel: 'auth:submitPat', args: { token: 'test-token-not-real' } },
    ])
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
  })

  it('サインインできなければ、貼り付けの画面のまま理由を出す', async () => {
    await renderPage(AUTH_FAILED, {
      'auth:submitPat': { ok: false, error: { code: 'pat_invalid' } },
    })
    await userEvent.click(screen.getByRole('button', { name: 'サインインし直す' }))
    await userEvent.type(screen.getByLabelText('トークン'), 'test-token-not-real')
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByRole('alert').textContent).toMatch(/サインインできませんでした/)
    expect(screen.getByRole('heading', { name: 'GitHub にサインインし直す' })).toBeTruthy()
  })
})

// N-09、AC-38、Q-07、component-frontend.md 2.2 の DesktopNotificationBanner
describe('デスクトップ通知を出せなかったことの知らせ（N-09、AC-38）', () => {
  const FAILED_AT = '2026-01-02T03:10:00Z'
  const failed = (failure: 'os_rejected' | 'outside_applications_folder') =>
    appState({ desktopNotification: { failure, failedAt: FAILED_AT } })

  it('OS が断ったら、理由と出せなかった時刻を出し、「OS の通知の設定を開く」で OS の設定を開くよう頼む', async () => {
    const api = await renderPage(failed('os_rejected'))
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(
      /デスクトップ通知を出せませんでした。OS の通知の設定で.*出せなかった時刻/,
    )
    expect(
      within(status).getByText('出せなかった時刻').nextElementSibling?.getAttribute('datetime'),
    ).toBe(FAILED_AT)
    await userEvent.click(screen.getByRole('button', { name: 'OS の通知の設定を開く' }))
    expect(api.invocations).toEqual([{ channel: 'os:openNotificationSettings', args: undefined }])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('OS の設定を開けなければ、その旨を出す', async () => {
    await renderPage(failed('os_rejected'), {
      'os:openNotificationSettings': { ok: false, error: { code: 'internal' } },
    })
    await userEvent.click(screen.getByRole('button', { name: 'OS の通知の設定を開く' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'OS の通知の設定を開けませんでした。OS の設定から「通知」を開いてください。',
    )
  })

  it('アプリケーションフォルダの外から開いているなら、移して開き直すよう出す', async () => {
    await renderPage(failed('outside_applications_folder'))
    expect(screen.getByRole('status').textContent).toMatch(
      /デスクトップ通知を出せませんでした。アプリケーションフォルダの外から開いているためです。/,
    )
    expect(screen.queryByRole('button', { name: 'OS の通知の設定を開く' })).toBeNull()
  })

  it('受け取れていない知らせとは別に出し、出せるようになったら消える', async () => {
    const api = await renderPage(
      appState({
        ingest: { state: 'offline' },
        desktopNotification: { failure: 'os_rejected', failedAt: FAILED_AT },
      }),
    )
    expect(screen.getAllByRole('status')).toHaveLength(2)
    act(() => api.push('state:changed', appState({ ingest: { state: 'offline' } })))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByText(/デスクトップ通知を出せませんでした/)).toBeNull()
  })
})

// F-08、AC-11、component-frontend.md 5.「デスクトップ通知のクリック」
describe('デスクトップ通知のクリック（F-08）', () => {
  const emphasizedRow = () =>
    within(screen.getByRole('list'))
      .getAllByRole('button')
      .find((row) => row.getAttribute('aria-current') === 'true')

  it('ui:focusEvent が届いたら、その出来事を強調する', async () => {
    const api = await renderPage(appState())
    act(() => api.push('ui:focusEvent', { eventId: 'IC_1' }))
    expect(emphasizedRow()?.textContent).toContain('ログイン画面')
  })

  it('サインインし直す画面を開いていても、出来事の一覧に戻して強調する', async () => {
    const api = await renderPage(AUTH_FAILED)
    await userEvent.click(screen.getByRole('button', { name: 'サインインし直す' }))
    act(() => api.push('ui:focusEvent', { eventId: 'IC_1' }))
    expect(screen.getByRole('heading', { name: '出来事' })).toBeTruthy()
    expect(emphasizedRow()?.textContent).toContain('ログイン画面')
  })
})
