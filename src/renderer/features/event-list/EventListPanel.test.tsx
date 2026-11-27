import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appState,
  createFakeApi,
  githubEvent,
  type FakeAnswers,
} from '../../../../test/support/fake-github-inbox-api'
import type { GitHubEvent } from '../../../shared/domain'
import { createMainStore } from '../../main-store/main-store'
import { MainStoreProvider } from '../../main-store/use-main-store'
import { EventListPanel } from './EventListPanel'

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

const comment = githubEvent('IC_1', '2026-01-31T11:55:00Z', {
  excerpt: '1行目\n\n> 引用の2行目',
})
const review = githubEvent('PRR_1', '2026-01-31T09:00:00Z', {
  type: 'review',
  reviewResult: 'changes_requested',
  actor: { login: 'carol', isBot: false },
  target: {
    kind: 'pull_request',
    repository: 'example-org/api',
    number: 7,
    title: '検索を速くする',
    url: 'https://github.com/example-org/api/pull/7',
  },
  url: 'https://github.com/example-org/api/pull/7#pullrequestreview-1',
})
const ci = githubEvent('WFR_1#1', '2026-01-30T12:00:00Z', {
  type: 'ci',
  ciConclusion: 'cancelled',
  actor: { login: 'alice', isBot: false },
  target: {
    kind: 'workflow_run',
    repository: 'alice/tools',
    title: 'CI: 文言を直す（main）',
    url: 'https://github.com/alice/tools/actions/runs/1',
  },
  url: 'https://github.com/alice/tools/actions/runs/1',
})
const teamRequest = githubEvent('RRE_1', '2026-01-25T00:00:00Z', {
  type: 'review_requested',
  viaTeam: true,
})

async function renderPanel(events: GitHubEvent[], answers: FakeAnswers = {}) {
  const api = createFakeApi({ state: appState(), events, answers })
  const store = createMainStore(api)
  render(
    <MainStoreProvider store={store}>
      <EventListPanel events={events} />
    </MainStoreProvider>,
  )
  await act(() => store.start())
  return api
}

const rows = () => within(screen.getByRole('list')).getAllByRole('button')
const rowFor = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

describe('出来事の一覧の1行（F-11、component-frontend.md 2.2）', () => {
  it('レビューの結果・CI の結果（GitHub の値のまま）・チーム宛てをラベルで出す', async () => {
    await renderPanel([review, ci, teamRequest])
    expect(within(rowFor('検索を速くする')).getByText('修正依頼')).toBeTruthy()
    expect(within(rowFor('CI: 文言を直す')).getByText('cancelled')).toBeTruthy()
    expect(within(rowFor('ログイン画面')).getByText('チーム宛て')).toBeTruthy()
  })

  it('抜粋は改行を空白にして1行で出す。Markdown は HTML にしない', async () => {
    await renderPanel([comment])
    expect(within(rowFor('ログイン画面')).getByText('1行目 > 引用の2行目')).toBeTruthy()
  })

  it.each([
    [comment, '5 分前'],
    [review, '3 時間前'],
    [ci, '昨日'],
  ])('いつは「5分前」の形で出し、指したときの日時も持つ', async (event, relative) => {
    await renderPanel([event])
    const time = within(rowFor(event.target.title)).getByText(relative)
    expect(time.getAttribute('datetime')).toBe(event.occurredAt)
    expect(time.getAttribute('title')).not.toBe('')
  })
})

describe('GitHub のページを開く（F-12、AC-15）', () => {
  it('行を押すと、出来事のページを開くようメインに頼む', async () => {
    const api = await renderPanel([comment, review])
    await userEvent.click(rowFor('検索を速くする'))
    expect(api.invocations).toEqual([{ channel: 'shell:openGitHub', args: { url: review.url } }])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('開けなければ、その旨を出す', async () => {
    await renderPanel([comment], {
      'shell:openGitHub': { ok: false, error: { code: 'url_not_allowed' } },
    })
    await userEvent.click(rowFor('ログイン画面'))
    expect(screen.getByRole('alert').textContent).toBe(
      'GitHub のページを開けませんでした。もう一度押してください。',
    )
  })
})

describe('絞り込み（F-13、AC-16）', () => {
  const events = [comment, review, ci]

  it('文字で探す', async () => {
    await renderPanel(events)
    await userEvent.type(screen.getByLabelText('文字で探す'), 'carol')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.textContent).toContain('検索を速くする')
  })

  it('種類で絞る', async () => {
    await renderPanel(events)
    await userEvent.selectOptions(screen.getByLabelText('種類'), 'CI の結果')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.textContent).toContain('CI: 文言を直す')
  })

  it('リポジトリで絞る。選択肢は一覧にあるリポジトリ', async () => {
    await renderPanel(events)
    const select = screen.getByLabelText('リポジトリ')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['すべて', 'alice/tools', 'example-org/api', 'example-org/app'])
    await userEvent.selectOptions(select, 'example-org/app')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.textContent).toContain('ログイン画面')
  })

  it('条件に合うものが無ければその旨を出し、絞り込みを解くと元に戻る', async () => {
    await renderPanel(events)
    expect(screen.queryByRole('button', { name: '絞り込みを解く' })).toBeNull()
    await userEvent.type(screen.getByLabelText('文字で探す'), 'nothing')
    expect(screen.getByText('条件に合う出来事はありません')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '絞り込みを解く' }))
    expect(rows()).toHaveLength(3)
    expect(screen.getByLabelText<HTMLInputElement>('文字で探す').value).toBe('')
  })

  it('出来事が無いときは、絞り込みとは別の文言を出す', async () => {
    await renderPanel([])
    expect(screen.getByText('まだ出来事はありません')).toBeTruthy()
  })
})

// D-032: 文字で探した語を、行の中で強調する（2026-11-27 依頼者が S3b の確かめで求めた）
describe('探した語の強調（D-032）', () => {
  const marks = (row: HTMLElement) =>
    within(row)
      .queryAllByText(/./, { selector: 'mark' })
      .map((element) => element.textContent)

  it('タイトルと誰がの中で、探した語を強調する（大文字と小文字は区別しない）', async () => {
    await renderPanel([comment, review])
    await userEvent.type(screen.getByLabelText('文字で探す'), 'CAROL 速く')
    expect(marks(rowFor('検索を速くする'))).toEqual(['速く', 'carol'])
  })

  it('リポジトリと番号・抜粋・CI の結果の中も強調する', async () => {
    await renderPanel([comment, review, ci])
    await userEvent.type(screen.getByLabelText('文字で探す'), 'api #7')
    expect(marks(rowFor('検索を速くする'))).toEqual(['api', '#7'])

    await userEvent.clear(screen.getByLabelText('文字で探す'))
    await userEvent.type(screen.getByLabelText('文字で探す'), '引用')
    expect(marks(rowFor('ログイン画面'))).toEqual(['引用'])

    await userEvent.clear(screen.getByLabelText('文字で探す'))
    await userEvent.type(screen.getByLabelText('文字で探す'), 'cancel')
    expect(marks(rowFor('CI: 文言を直す'))).toEqual(['cancel'])
  })

  it('文字で探していなければ（種類・リポジトリだけで絞っても）強調しない', async () => {
    await renderPanel([comment, review])
    await userEvent.selectOptions(screen.getByLabelText('種類'), 'レビュー')
    expect(marks(rowFor('検索を速くする'))).toEqual([])
  })
})
