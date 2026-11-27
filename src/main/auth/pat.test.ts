import { describe, expect, it } from 'vitest'
import type { ViewerResult } from '../github/viewer'
import { judgePat, normalizePat } from './pat'

const ok = (scopes: string[] | null): ViewerResult => ({ kind: 'ok', login: 'alice', scopes })

describe('貼られたトークンの形（auth-flow.md 3.）', () => {
  it.each([
    ['前後の空白と改行を除く', '  test-token-not-real\n', 'test-token-not-real'],
    ['そのままのもの', 'test-token-not-real', 'test-token-not-real'],
    ['空白だけなら空', ' \t\n', ''],
  ])('%s', (_name, input, expected) => {
    expect(normalizePat(input)).toBe(expected)
  })
})

describe('PAT を保存してよいか（auth-flow.md 3.）', () => {
  it.each([
    ['repo と notifications がある', ok(['repo', 'notifications']), { ok: true, login: 'alice' }],
    [
      'repo だけでもよい（repo があれば GitHub の通知も読める）',
      ok(['repo']),
      { ok: true, login: 'alice' },
    ],
    ['repo が無い', ok(['notifications']), { ok: false, code: 'pat_missing_scope' }],
    [
      'repo の一部（repo:status）だけ',
      ok(['repo:status', 'notifications']),
      { ok: false, code: 'pat_missing_scope' },
    ],
    ['スコープが1つも無い', ok([]), { ok: false, code: 'pat_missing_scope' }],
    [
      'スコープのヘッダーが無い（fine-grained PAT）',
      ok(null),
      { ok: false, code: 'pat_missing_scope' },
    ],
  ] satisfies [string, ViewerResult, unknown][])('%s', (_name, result, expected) => {
    expect(judgePat(result)).toEqual(expected)
  })

  it.each([
    ['401（GitHub に入れない）', { kind: 'auth_failed' }, 'pat_invalid'],
    ['つながらない', { kind: 'offline' }, 'offline'],
    [
      '利用制限',
      { kind: 'rate_limited', retryAt: new Date('2026-01-01T00:01:00Z') },
      'rate_limited',
    ],
    ['403・404', { kind: 'not_accessible', status: 403 }, 'github_error'],
    ['GitHub の障害', { kind: 'github_error', status: 500 }, 'github_error'],
  ] satisfies [string, Extract<ViewerResult, { kind: 'failed' }>['failure'], string][])(
    '%s → %s',
    (_name, failure, code) => {
      expect(judgePat({ kind: 'failed', failure })).toEqual({ ok: false, code })
    },
  )
})
