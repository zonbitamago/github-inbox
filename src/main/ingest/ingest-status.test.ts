import { describe, expect, it } from 'vitest'
import type { GitHubFailure } from '../github/client'
import { IngestStatus } from './ingest-status'

const SUCCESS_AT = new Date('2026-01-31T00:00:00Z')
const RETRY_AT = new Date('2026-01-31T00:10:00Z')

function afterSuccess() {
  const status = new IngestStatus()
  status.succeeded(SUCCESS_AT)
  return status
}

// component-backend.md 6.3「エラーの分類と受け取りの状態」
describe('受け取りの状態の移り変わり（component-backend.md 6.3、N-08）', () => {
  it('はじめは取り込み中（Q-03）', () => {
    expect(new IngestStatus().current()).toEqual({ state: 'syncing' })
  })

  it('成功したら ok にし、成功した時刻を持つ', () => {
    expect(new IngestStatus().succeeded(SUCCESS_AT)).toEqual({
      state: 'ok',
      lastSuccessAt: '2026-01-31T00:00:00.000Z',
    })
  })

  it.each([
    ['認証が切れた（401）', { kind: 'auth_failed' }, { state: 'auth_failed' }],
    [
      '利用制限',
      { kind: 'rate_limited', retryAt: RETRY_AT },
      { state: 'rate_limited', retryAt: '2026-01-31T00:10:00.000Z' },
    ],
  ] satisfies [string, GitHubFailure, object][])('%s はすぐ出す', (_name, failure, expected) => {
    expect(afterSuccess().failed(failure)).toEqual({
      ...expected,
      lastSuccessAt: '2026-01-31T00:00:00.000Z',
    })
  })

  it.each([
    ['つながらない', { kind: 'offline' }],
    ['GitHub の障害', { kind: 'github_error', status: 502 }],
  ] satisfies [string, GitHubFailure][])(
    '%s は、1回目はそれまでの状態のまま、続けて2回で出す（Q-06）',
    (_name, failure) => {
      const status = afterSuccess()
      expect(status.failed(failure)).toEqual({
        state: 'ok',
        lastSuccessAt: '2026-01-31T00:00:00.000Z',
      })
      expect(status.failed(failure)).toEqual({
        state: failure.kind,
        lastSuccessAt: '2026-01-31T00:00:00.000Z',
      })
    },
  )

  it('つながらない → GitHub の障害と続いたら、2回目の理由を出す', () => {
    const status = afterSuccess()
    status.failed({ kind: 'offline' })
    expect(status.failed({ kind: 'github_error', status: 500 }).state).toBe('github_error')
  })

  it('間に成功を挟んだら、数え直す', () => {
    const status = afterSuccess()
    status.failed({ kind: 'offline' })
    status.succeeded(SUCCESS_AT)
    expect(status.failed({ kind: 'offline' }).state).toBe('ok')
  })

  it('取り込み中に1回つながらなくても、取り込み中のまま', () => {
    const status = new IngestStatus()
    status.syncing()
    expect(status.failed({ kind: 'offline' })).toEqual({ state: 'syncing' })
  })

  it('1つのリポジトリだけの 403・404 では、状態を変えない', () => {
    expect(afterSuccess().failed({ kind: 'not_accessible', status: 404 }).state).toBe('ok')
  })

  it('取り込み中にしても、前に成功した時刻は残す', () => {
    expect(afterSuccess().syncing()).toEqual({
      state: 'syncing',
      lastSuccessAt: '2026-01-31T00:00:00.000Z',
    })
  })

  it('成功したら知らせを消す（利用制限の後）', () => {
    const status = afterSuccess()
    status.failed({ kind: 'rate_limited', retryAt: RETRY_AT })
    expect(status.succeeded(RETRY_AT)).toEqual({
      state: 'ok',
      lastSuccessAt: '2026-01-31T00:10:00.000Z',
    })
  })
})
