import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appState,
  createFakeApi,
  prListSnapshot,
  pullRequestItem,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import type { AppState, PrListSnapshot } from '../../../shared/ipc-contract'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider, useMainSnapshot } from '../../main-store/use-main-store'
import { PrListPanel } from './PrListPanel'

const NOW = new Date('2026-01-31T12:00:00Z')

beforeEach(() => {
  // 「5分前」の表し方のために時刻だけを止める（タイマーは本物のまま。user-event が使うため）
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const reviewPending = pullRequestItem('PR_1', '2026-01-31T11:55:00Z', {
  number: 121,
  title: 'エラーの文言を見直す',
  url: 'https://github.com/example-org/mobile/pull/121',
  repository: 'example-org/mobile',
  author: { login: 'dave', isBot: false },
  waitingReasons: ['review_pending'],
})
const ownFailing = pullRequestItem('PR_2', '2026-01-31T09:00:00Z', {
  number: 7,
  title: 'Fix Typo',
  repository: 'example-org/api',
  url: 'https://github.com/example-org/api/pull/7',
  author: { login: 'alice', isBot: false },
  waitingReasons: ['changes_requested', 'ci_failed'],
})
const merged = pullRequestItem('PR_3', '2026-01-30T12:00:00Z', {
  number: 9,
  title: '依存の更新',
  state: 'merged',
  author: { login: 'example-bot', isBot: true },
})
const draft = pullRequestItem('PR_4', '2026-01-25T00:00:00Z', {
  number: 11,
  title: '下書きの変更',
  state: 'draft',
  author: { login: 'alice', isBot: false },
})
const SNAPSHOT = prListSnapshot([reviewPending, ownFailing, merged, draft], {
  fetchedAt: '2026-01-31T11:57:00Z',
})

/** MainPage と同じく、store から一覧と状況を読んで渡す */
function Connected() {
  const { appState: state, prList } = useMainSnapshot()
  return <PrListPanel prList={prList} status={state?.prList ?? { loading: false }} />
}

async function renderPanel(
  options: { prList?: PrListSnapshot | null; state?: AppState; answers?: FakeAnswers } = {},
) {
  const api = createFakeApi({
    state: options.state ?? appState(),
    prList: options.prList === undefined ? SNAPSHOT : options.prList,
    ...(options.answers === undefined ? {} : { answers: options.answers }),
  })
  const store = createMainStore(api)
  render(
    <MainStoreProvider store={store}>
      <Connected />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return api
}

const rows = () => within(screen.getByRole('list')).getAllByRole('button')
const rowFor = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

describe('PR の一覧の1行（F-14・F-15、component-frontend.md 2.2）', () => {
  it('更新の新しい順に、届いた順のまま全件を出す（ページ送りはしない。AC-18）', async () => {
    await renderPanel()
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('エラーの文言を見直す'),
      expect.stringContaining('Fix Typo'),
      expect.stringContaining('依存の更新'),
      expect.stringContaining('下書きの変更'),
    ])
  })

  it('状態・自分待ちの理由のラベル・タイトル・リポジトリと番号・作成者・更新を出す', async () => {
    await renderPanel()
    const row = rowFor('Fix Typo')
    expect(row.textContent).toContain('オープン')
    expect(row.textContent).toContain('修正依頼あり')
    expect(row.textContent).toContain('CI 失敗')
    expect(row.textContent).toContain('example-org/api #7')
    expect(row.textContent).toContain('alice')
    expect(within(row).getByText('3 時間前').getAttribute('dateTime')).toBe('2026-01-31T09:00:00Z')
  })

  it('自分待ちでない PR（マージ済み・下書き）は、状態だけで理由のラベルは付かない（AC-17）', async () => {
    await renderPanel()
    expect(rowFor('依存の更新').textContent).toMatch(/^マージ済み依存の更新/)
    expect(rowFor('下書きの変更').textContent).toMatch(/^下書き下書きの変更/)
  })

  it('bot が作った PR には bot の印を付ける', async () => {
    await renderPanel()
    expect(within(rowFor('依存の更新')).getByText('bot')).toBeTruthy()
    expect(within(rowFor('Fix Typo')).queryByText('bot')).toBeNull()
  })

  it('期間と、最後に取った時刻を出す', async () => {
    await renderPanel()
    const heading = screen.getByRole('heading', { name: 'PR' }).parentElement
    expect(heading?.textContent).toContain('期間 7 日')
    expect(heading?.textContent).toContain('最後に取得 3 分前')
  })

  it('英語に切り替えると、ラベルと期間は英語になり、GitHub の文字はそのまま（AC-28）', async () => {
    await renderPanel({ state: appState({}, { language: 'en' }) })
    const row = rowFor('Fix Typo')
    expect(row.textContent).toContain('Changes requested')
    expect(row.textContent).toContain('CI failed')
    expect(
      screen.getByRole('heading', { name: 'Pull requests' }).parentElement?.textContent,
    ).toContain('Period 7 days')
  })
})

describe('PR を開く（F-17、AC-21）', () => {
  it('行を押すと、PR の URL を開くようメインに頼む', async () => {
    const api = await renderPanel()
    await userEvent.click(rowFor('Fix Typo'))
    expect(api.invocations).toEqual([
      { channel: 'shell:openGitHub', args: { url: 'https://github.com/example-org/api/pull/7' } },
    ])
  })

  it('開けなければ理由を出す', async () => {
    await renderPanel({
      answers: { 'shell:openGitHub': { ok: false, error: { code: 'url_not_allowed' } } },
    })
    await userEvent.click(rowFor('Fix Typo'))
    expect(screen.getByRole('alert').textContent).toBe(
      'GitHub のページを開けませんでした。もう一度押してください。',
    )
  })
})

describe('絞り込み（F-18、AC-22）', () => {
  it('文字で探すと、条件に合う PR だけが出て、探した語を強調する（D-032）', async () => {
    await renderPanel()
    await userEvent.type(screen.getByRole('textbox', { name: '文字で探す' }), 'typo')
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0] ?? document.body).getByText('Typo').tagName).toBe('MARK')
  })

  it('状態で絞り込む', async () => {
    await renderPanel()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '状態' }), 'マージ済み')
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining('依存の更新')])
  })

  it('リポジトリで絞り込む（選択肢は一覧にあるリポジトリ）', async () => {
    await renderPanel()
    const select = screen.getByRole('combobox', { name: 'リポジトリ' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['すべて', 'example-org/api', 'example-org/app', 'example-org/mobile'])
    await userEvent.selectOptions(select, 'example-org/api')
    expect(rows()).toHaveLength(1)
  })

  it('自分待ちの理由で絞り込む。「自分待ちの理由あり」ではラベルの付いた PR だけが出る', async () => {
    await renderPanel()
    const select = screen.getByRole('combobox', { name: '自分待ちの理由' })
    await userEvent.selectOptions(select, 'CI 失敗')
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining('Fix Typo')])
    await userEvent.selectOptions(select, '自分待ちの理由あり（どれか1つ）')
    expect(rows()).toHaveLength(2)
  })

  it('合うものが無ければそう出し、「絞り込みを解く」で元に戻る', async () => {
    await renderPanel()
    await userEvent.type(screen.getByRole('textbox', { name: '文字で探す' }), '無い語')
    expect(screen.getByText('条件に合う PR はありません')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '絞り込みを解く' }))
    expect(rows()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: '絞り込みを解く' })).toBeNull()
  })

  it('新しい一覧が届いても、絞り込みはそのまま', async () => {
    const api = await renderPanel()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '状態' }), 'マージ済み')
    act(() =>
      api.push(
        'prs:updated',
        prListSnapshot([merged, { ...merged, id: 'PR_5', title: '別のマージ' }]),
      ),
    )
    expect(rows()).toHaveLength(2)
  })
})

describe('リロード（F-20、AC-20）', () => {
  it('リロードを押すとメインに頼み、届いた一覧に入れ替わる', async () => {
    const api = await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'リロード' }))
    expect(api.invocations).toEqual([{ channel: 'prs:reload', args: undefined }])

    const requested = pullRequestItem('PR_9', '2026-01-31T11:59:00Z', {
      title: '新しくレビューを頼まれた PR',
      waitingReasons: ['review_pending'],
    })
    act(() => api.push('prs:updated', prListSnapshot([requested, ...SNAPSHOT.items])))
    expect(rowFor('新しくレビューを頼まれた PR').textContent).toContain('レビュー依頼に未対応')
  })

  it('取得中はそう出す。一覧は出したまま', async () => {
    const api = await renderPanel()
    act(() => api.push('state:changed', appState({ prList: { loading: true } })))
    expect(screen.getByRole('status').textContent).toBe('取得しています')
    expect(rows()).toHaveLength(4)
    act(() => api.push('state:changed', appState({ prList: { loading: false } })))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it.each<[string, AppState['prList']['error'], string]>([
    ['つながらない', 'offline', 'GitHub につながらないため'],
    ['利用制限', 'rate_limited', 'GitHub の利用制限にかかったため'],
    ['GitHub の障害', 'github_error', 'GitHub の障害のため'],
    ['認証が切れた', 'auth_failed', 'GitHub にサインインし直すと'],
    ['サインインしていない', 'not_signed_in', 'GitHub にサインインし直すと'],
    ['そのほか', 'internal', 'PR の一覧を取れませんでした。もう一度'],
  ])('取れなかった理由（%s）を出し、前の一覧は残す', async (_name, error, text) => {
    await renderPanel({ state: appState({ prList: { loading: false, error } }) })
    expect(screen.getByRole('alert').textContent).toContain(text)
    expect(rows()).toHaveLength(4)
  })

  it('メインに頼めなかったときも理由を出す', async () => {
    const rejected = Promise.reject(new Error('unknown_channel'))
    // 画面が受け取る前に「受け手の無い失敗」と報告されないよう、先に受け手を付けておく
    rejected.catch(() => undefined)
    await renderPanel({ answers: { 'prs:reload': rejected } })
    await userEvent.click(screen.getByRole('button', { name: 'リロード' }))
    expect(screen.getByRole('alert').textContent).toContain('PR の一覧を取れませんでした')
  })
})

describe('一覧が無いとき', () => {
  it('まだ取っていなければそう出す', async () => {
    await renderPanel({ prList: null })
    expect(screen.getByText('まだ PR の一覧を取っていません')).toBeTruthy()
  })

  it('取得中なら、取得中の表示だけを出す', async () => {
    await renderPanel({ prList: null, state: appState({ prList: { loading: true } }) })
    expect(screen.getByRole('status').textContent).toBe('取得しています')
    expect(screen.queryByText('まだ PR の一覧を取っていません')).toBeNull()
  })

  it('期間内に関わった PR が無ければそう出す', async () => {
    await renderPanel({ prList: prListSnapshot([]) })
    expect(screen.getByText('期間内に関わった PR はありません')).toBeTruthy()
  })
})
