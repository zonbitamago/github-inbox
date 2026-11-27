import { describe, expect, it } from 'vitest'
import type { AppState } from '../../../shared/ipc-contract'
import { selectIngestNotice } from './ingest-notice'

const SIGNED_IN: AppState['auth'] = { status: 'signed_in', login: 'alice', method: 'pat' }
const LAST = '2026-01-31T00:00:00.000Z'

// component-frontend.md 5.「知らせの優先順」、N-08、AC-14
describe('受け取れていないことの知らせ（N-08）', () => {
  it.each([
    ['ok は出さない', { state: 'ok', lastSuccessAt: LAST }, null],
    ['サインインしていないときは出さない', { state: 'signed_out' }, null],
    ['取り込み中', { state: 'syncing' }, { kind: 'syncing' }],
    [
      'つながらない',
      { state: 'offline', lastSuccessAt: LAST },
      { kind: 'offline', lastSuccessAt: LAST },
    ],
    ['GitHub の障害', { state: 'github_error' }, { kind: 'github_error' }],
    [
      '利用制限は再開する時刻も渡す',
      { state: 'rate_limited', retryAt: '2026-01-31T00:10:00.000Z' },
      { kind: 'rate_limited', retryAt: '2026-01-31T00:10:00.000Z' },
    ],
    ['認証が切れた', { state: 'auth_failed' }, { kind: 'auth_failed' }],
  ] satisfies [string, AppState['ingest'], unknown][])('%s', (_name, ingest, expected) => {
    expect(selectIngestNotice({ auth: SIGNED_IN, ingest })).toEqual(expected)
  })

  it('認証の状態が切れていれば、受け取りの状態が何でも「認証が切れた」を出す（一番重い）', () => {
    expect(
      selectIngestNotice({
        auth: { status: 'auth_failed', login: 'alice', method: 'pat' },
        ingest: { state: 'offline' },
      }),
    ).toEqual({ kind: 'auth_failed' })
  })
})
