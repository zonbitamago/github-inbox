import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appState,
  createFakeApi,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider } from '../../main-store/use-main-store'
import { PAT_CREATE_URL } from './pat'
import { PatPanel } from './PatPanel'

async function renderPanel(answers: FakeAnswers = {}) {
  const api = createFakeApi({
    state: appState({ auth: { status: 'signed_out' }, onboardingRequired: true }),
    answers,
  })
  const store = createMainStore(api)
  render(
    <MainStoreProvider store={store}>
      <PatPanel title="auth.signIn.title" />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return api
}

const TOKEN = 'test-token-not-real'

// 描いた画面をテストごとに片付ける（vitest の globals を使っていないため、自動では片付かない）
afterEach(cleanup)

describe('PAT でのサインイン（component-frontend.md 3. の手順2、F-36 (2)）', () => {
  it('作り方の手順と、repo スコープの表示の意味（アプリは書き込まない）を出す', async () => {
    await renderPanel()
    expect(screen.getByRole('heading', { name: 'GitHub でサインイン' })).toBeTruthy()
    expect(screen.getByText(/Full control of private repositories/)).toBeTruthy()
    expect(screen.getByText(/書き込みはしません/)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('「作成ページを開く」で、スコープを入れた作成ページを開くよう頼む', async () => {
    const api = await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: '作成ページを開く' }))
    expect(api.invocations).toEqual([
      { channel: 'shell:openGitHub', args: { url: PAT_CREATE_URL } },
    ])
  })

  it('作成ページを開けなければ、その旨を出す', async () => {
    await renderPanel({ 'shell:openGitHub': { ok: false, error: { code: 'url_not_allowed' } } })
    await userEvent.click(screen.getByRole('button', { name: '作成ページを開く' }))
    expect(screen.getByRole('alert').textContent).toBe(
      '作成ページを開けませんでした。もう一度押してください。',
    )
  })

  it('何も貼っていなければ「サインイン」を押せない', async () => {
    await renderPanel()
    expect(screen.getByRole('button', { name: 'サインイン' })).toHaveProperty('disabled', true)
  })

  it('貼ったトークンを送り、サインインできたら貼り付け欄を空にする', async () => {
    const api = await renderPanel()
    const input = screen.getByLabelText('トークン')
    expect(input).toHaveProperty('type', 'password')
    await userEvent.type(input, TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(api.invocations).toEqual([{ channel: 'auth:submitPat', args: { token: TOKEN } }])
    expect(input).toHaveProperty('value', '')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('確かめている間は、ボタンを押せず「確かめています」と出す', async () => {
    let answer: (value: { ok: true; value: { login: string } }) => void = () => undefined
    await renderPanel({
      'auth:submitPat': new Promise((resolve) => {
        answer = resolve
      }),
    })
    await userEvent.type(screen.getByLabelText('トークン'), TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByRole('button', { name: '確かめています' })).toHaveProperty('disabled', true)
    await act(async () => {
      answer({ ok: true, value: { login: 'alice' } })
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'サインイン' })).toBeTruthy()
  })

  it.each([
    ['pat_invalid', '貼り間違いや有効期限切れが無いか確かめてください。'],
    ['pat_missing_scope', 'repo と notifications を選んで作り直してください。'],
    ['offline', 'ネットワークを確かめてから、もう一度押してください。'],
    ['encryption_unavailable', 'トークンを保存できません。'],
  ] as const)('%s なら、何をすればよいかを出し、貼ったものは残す', async (code, expected) => {
    await renderPanel({ 'auth:submitPat': { ok: false, error: { code } } })
    const input = screen.getByLabelText('トークン')
    await userEvent.type(input, TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByRole('alert').textContent).toContain(expected)
    expect(input).toHaveProperty('value', TOKEN)
  })

  it('頼むこと自体に失敗したら、もう一度押すよう出す', async () => {
    const rejected = Promise.reject(new Error('unknown_channel'))
    // 画面が受け取る前に「受け手の無い失敗」と報告されないよう、先に受け手を付けておく
    rejected.catch(() => undefined)
    await renderPanel({ 'auth:submitPat': rejected })
    await userEvent.type(screen.getByLabelText('トークン'), TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'サインインできませんでした。もう一度押してください。',
    )
  })
})
