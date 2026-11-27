import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import type { ViewerResult } from '../github/viewer'
import { AuthService, type AuthServiceDeps, type AuthView } from './auth-service'
import type { TokenLoad } from './token-store'

const NOW = new Date('2026-01-01T00:00:00Z')
const TOKEN = 'test-token-not-real'
const VIEWER_OK: ViewerResult = { kind: 'ok', login: 'alice', scopes: ['repo', 'notifications'] }

/** 外から進める時計（予約した処理を覚えておく） */
function fakeTimer() {
  const scheduled: { callback: () => void; delayMs: number; cancelled: boolean }[] = []
  return {
    scheduled,
    schedule(callback: () => void, delayMs: number) {
      const entry = { callback, delayMs, cancelled: false }
      scheduled.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    /** 予約した処理のうち、取り消されていないものを1つ動かす */
    runNext() {
      const entry = scheduled.find((item) => !item.cancelled)
      if (entry === undefined) throw new Error('予約が無い')
      entry.cancelled = true
      entry.callback()
      return entry.delayMs
    },
    pending: () => scheduled.filter((item) => !item.cancelled).length,
  }
}

function setup(
  options: {
    stored?: TokenLoad
    platform?: 'darwin' | 'win32'
    lastLaunchedVersion?: string
    viewer?: ViewerResult[]
    encryptionAvailable?: boolean
  } = {},
) {
  let stored: TokenLoad = options.stored ?? { kind: 'missing' }
  let lastLaunchedVersion = options.lastLaunchedVersion
  const viewerResults = [...(options.viewer ?? [VIEWER_OK])]
  const published: AuthView[] = []
  /** 取り込みへの引き継ぎ（signedIn:ユーザー名・signedOut） */
  const handovers: string[] = []
  const requestedTokens: string[] = []
  const calls: string[] = []
  const timer = fakeTimer()
  const logger = createMemoryLogger()
  const deps: AuthServiceDeps = {
    tokenStore: {
      exists: () => Promise.resolve(stored.kind !== 'missing'),
      load: () => {
        calls.push('load')
        return Promise.resolve(stored)
      },
      save: (token) => {
        if (options.encryptionAvailable === false) return Promise.resolve('encryption_unavailable')
        calls.push('save')
        stored = { kind: 'ok', token }
        return Promise.resolve('saved')
      },
      remove: () => {
        calls.push('remove')
        stored = { kind: 'missing' }
        return Promise.resolve()
      },
    },
    fetchViewer: (token) => {
      requestedTokens.push(token)
      return Promise.resolve(viewerResults.shift() ?? VIEWER_OK)
    },
    version: '1.2.0',
    platform: options.platform ?? 'darwin',
    lastLaunchedVersion: () => lastLaunchedVersion,
    saveLastLaunchedVersion: (version) => {
      lastLaunchedVersion = version
      return Promise.resolve()
    },
    clearEvents: () => {
      calls.push('clearEvents')
      return Promise.resolve()
    },
    publish: (view) => published.push(view),
    onSignedIn: (login) => handovers.push(`signedIn:${login}`),
    onSignedOut: () => handovers.push('signedOut'),
    timer,
    now: () => NOW,
    logger,
  }
  const service = new AuthService(deps)
  return {
    service,
    published,
    handovers,
    requestedTokens,
    calls,
    timer,
    logger,
    last: () => published.at(-1),
    lastLaunched: () => lastLaunchedVersion,
    /** 画面に知らせずに、トークンのファイルだけが消えたことにする */
    vanish: () => {
      stored = { kind: 'missing' }
    },
  }
}

/** 予約した処理の中の Promise を流し切る */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const SIGNED_OUT: AuthView = { auth: { status: 'signed_out' }, ingest: { state: 'signed_out' } }
/** 確かめられた。ここから先の受け取りの状態は取り込みが知らせる */
const SIGNED_IN: AuthView = {
  auth: { status: 'signed_in', login: 'alice', method: 'pat' },
  ingest: { state: 'syncing' },
}

describe('立ち上げ（component-backend.md 5.1、auth-flow.md 4.）', () => {
  it('トークンが無ければ、サインインしていないとする（使い始めの案内）', async () => {
    const { service, requestedTokens } = setup()
    await expect(service.prepare()).resolves.toEqual(SIGNED_OUT)
    service.resume()
    await settle()
    expect(requestedTokens).toEqual([])
  })

  it('版が前と同じなら、すぐ読み出して GET /user で確かめ、取り込みに引き継ぐ', async () => {
    const { service, published, handovers, requestedTokens, lastLaunched } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
    })
    await expect(service.prepare()).resolves.toEqual({
      auth: { status: 'signed_in', method: 'pat' },
      ingest: { state: 'syncing' },
    })
    service.resume()
    await settle()
    expect(requestedTokens).toEqual([TOKEN])
    expect(published.at(-1)).toEqual(SIGNED_IN)
    expect(handovers).toEqual(['signedIn:alice'])
    expect(service.token()).toBe(TOKEN)
    expect(lastLaunched()).toBe('1.2.0')
  })

  it.each([
    ['版が変わった', '1.1.0'],
    ['前の版の記録が無い', undefined],
  ])('Mac で%sときは、読み出す前にキーチェーンの案内を出す（F-36 (5)）', async (_name, version) => {
    const { service, calls } = setup({
      stored: { kind: 'ok', token: TOKEN },
      ...(version === undefined ? {} : { lastLaunchedVersion: version }),
    })
    await expect(service.prepare()).resolves.toEqual({
      auth: { status: 'keychain_notice' },
      ingest: { state: 'signed_out' },
    })
    service.resume()
    await settle()
    expect(calls).not.toContain('load')
  })

  it('Windows では版が変わっても案内を出さない（DPAPI では確認が出ない）', async () => {
    const { service, last } = setup({
      stored: { kind: 'ok', token: TOKEN },
      platform: 'win32',
      lastLaunchedVersion: '1.1.0',
    })
    await service.prepare()
    service.resume()
    await settle()
    expect(last()).toEqual(SIGNED_IN)
  })

  it('案内で「続ける」を押したら読み出し、今の版を覚える', async () => {
    const { service, last, lastLaunched } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.1.0',
    })
    await service.prepare()
    await expect(service.continueAfterKeychainNotice()).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await settle()
    expect(last()).toEqual(SIGNED_IN)
    expect(lastLaunched()).toBe('1.2.0')
  })

  it('案内を出していないときの「続ける」は何もしない', async () => {
    const { service, calls } = setup()
    await service.prepare()
    await expect(service.continueAfterKeychainNotice()).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    expect(calls).toEqual([])
  })

  it('読み出せない（キーチェーンで断られた）ときは、サインインし直す画面にし、トークンは消さない', async () => {
    const { service, last, calls, lastLaunched } = setup({
      stored: { kind: 'unreadable' },
      lastLaunchedVersion: '1.1.0',
    })
    await service.prepare()
    await service.continueAfterKeychainNotice()
    expect(last()).toEqual({ auth: { status: 'signing_in' }, ingest: { state: 'signed_out' } })
    expect(calls).not.toContain('remove')
    expect(lastLaunched()).toBe('1.1.0')
  })

  it('読み出す前にトークンのファイルが消えていたら、サインインしていないとする', async () => {
    const { service, last, vanish } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.1.0',
    })
    await service.prepare()
    vanish()
    await service.continueAfterKeychainNotice()
    expect(last()).toEqual(SIGNED_OUT)
  })
})

describe('立ち上げ時の GET /user の失敗（component-backend.md 5.1・6.3、auth-flow.md 5.）', () => {
  async function started(viewer: ViewerResult[]) {
    const context = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
      viewer,
    })
    await context.service.prepare()
    context.service.resume()
    await settle()
    return context
  }

  it('401 なら、認証が切れたとする（やり直さない。取り込みも始めない）', async () => {
    const { last, timer, handovers } = await started([
      { kind: 'failed', failure: { kind: 'auth_failed' } },
    ])
    expect(last()).toEqual({
      auth: { status: 'auth_failed', method: 'pat' },
      ingest: { state: 'auth_failed' },
    })
    expect(timer.pending()).toBe(0)
    expect(handovers).toEqual([])
  })

  it('つながらなければ offline とし、60秒ごとにやり直す', async () => {
    const { last, timer } = await started([
      { kind: 'failed', failure: { kind: 'offline' } },
      VIEWER_OK,
    ])
    expect(last()).toEqual({
      auth: { status: 'signed_in', method: 'pat' },
      ingest: { state: 'offline' },
    })
    expect(timer.runNext()).toBe(60_000)
    await settle()
    expect(last()).toEqual(SIGNED_IN)
  })

  it('利用制限なら、指示された時刻にやり直す', async () => {
    const retryAt = new Date('2026-01-01T00:05:00Z')
    const { last, timer } = await started([
      { kind: 'failed', failure: { kind: 'rate_limited', retryAt } },
      VIEWER_OK,
    ])
    expect(last()).toEqual({
      auth: { status: 'signed_in', method: 'pat' },
      ingest: { state: 'rate_limited', retryAt: '2026-01-01T00:05:00.000Z' },
    })
    expect(timer.runNext()).toBe(5 * 60_000)
    await settle()
    expect(last()).toEqual(SIGNED_IN)
  })

  it.each([
    ['GitHub の障害', { kind: 'github_error', status: 500 }],
    ['403・404', { kind: 'not_accessible', status: 403 }],
  ] as const)('%s なら github_error とし、60秒ごとにやり直す', async (_name, failure) => {
    const { last, timer } = await started([{ kind: 'failed', failure }, VIEWER_OK])
    expect(last()?.ingest).toEqual({ state: 'github_error' })
    expect(timer.runNext()).toBe(60_000)
    await settle()
    expect(last()).toEqual(SIGNED_IN)
  })
})

describe('PAT を貼る（auth-flow.md 3.）', () => {
  it('確かめて保存し、サインインした状態にする。今の版も覚え、取り込みを始め直す', async () => {
    const { service, last, handovers, requestedTokens, calls, lastLaunched } = setup()
    await service.prepare()
    await expect(service.submitPat(`  ${TOKEN}\n`)).resolves.toEqual({
      ok: true,
      value: { login: 'alice' },
    })
    expect(requestedTokens).toEqual([TOKEN])
    expect(calls).toContain('save')
    expect(last()).toEqual(SIGNED_IN)
    expect(handovers).toEqual(['signedOut', 'signedIn:alice'])
    expect(service.token()).toBe(TOKEN)
    expect(lastLaunched()).toBe('1.2.0')
  })

  it('空白だけなら、問い合わせずに断る', async () => {
    const { service, requestedTokens } = setup()
    await service.prepare()
    await expect(service.submitPat(' \n')).resolves.toEqual({
      ok: false,
      error: { code: 'pat_invalid' },
    })
    expect(requestedTokens).toEqual([])
  })

  it.each([
    ['repo が無い', { kind: 'ok', login: 'alice', scopes: ['notifications'] }, 'pat_missing_scope'],
    ['401', { kind: 'failed', failure: { kind: 'auth_failed' } }, 'pat_invalid'],
    ['つながらない', { kind: 'failed', failure: { kind: 'offline' } }, 'offline'],
  ] satisfies [string, ViewerResult, string][])(
    '%s なら保存せず、状態も変えない',
    async (_name, viewer, code) => {
      const { service, calls, published } = setup({ viewer: [viewer] })
      await service.prepare()
      await expect(service.submitPat(TOKEN)).resolves.toEqual({ ok: false, error: { code } })
      expect(calls).not.toContain('save')
      expect(published).toEqual([])
      expect(service.token()).toBeUndefined()
    },
  )

  it('OS の安全な保管場所が使えなければ、保存せずに断る（N-05）', async () => {
    const { service, published } = setup({ encryptionAvailable: false })
    await service.prepare()
    await expect(service.submitPat(TOKEN)).resolves.toEqual({
      ok: false,
      error: { code: 'encryption_unavailable' },
    })
    expect(published).toEqual([])
    expect(service.token()).toBeUndefined()
  })

  it('立ち上げ時のやり直しを待っている間にサインインしたら、やり直しを取り消す', async () => {
    const { service, timer, last } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
      viewer: [{ kind: 'failed', failure: { kind: 'offline' } }, VIEWER_OK],
    })
    await service.prepare()
    service.resume()
    await settle()
    await service.submitPat(TOKEN)
    expect(timer.pending()).toBe(0)
    expect(last()).toEqual(SIGNED_IN)
  })
})

describe('サインアウト（auth-flow.md 6.、F-28）', () => {
  it('取り込みを止め、トークンと出来事を消し、サインインしていない状態にする', async () => {
    const { service, calls, last, handovers } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
    })
    await service.prepare()
    service.resume()
    await settle()
    await expect(service.signOut()).resolves.toEqual({ ok: true, value: undefined })
    expect(calls).toEqual(expect.arrayContaining(['remove', 'clearEvents']))
    expect(last()).toEqual(SIGNED_OUT)
    expect(handovers).toEqual(['signedIn:alice', 'signedOut'])
    expect(service.token()).toBeUndefined()
  })

  it('問い合わせの途中でサインアウトしたら、その結果で状態を戻さない', async () => {
    const { service, last, timer } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
      viewer: [{ kind: 'failed', failure: { kind: 'offline' } }],
    })
    await service.prepare()
    service.resume()
    await service.signOut()
    await settle()
    expect(last()).toEqual(SIGNED_OUT)
    expect(timer.pending()).toBe(0)
  })
})

describe('取り込みで認証が切れた（auth-flow.md 5.）', () => {
  it('認証が切れた状態にし、取り込みを止める。トークンは消さない', async () => {
    const { service, last, handovers, calls } = setup({
      stored: { kind: 'ok', token: TOKEN },
      lastLaunchedVersion: '1.2.0',
    })
    await service.prepare()
    service.resume()
    await settle()
    service.expire()
    expect(last()).toEqual({
      auth: { status: 'auth_failed', login: 'alice', method: 'pat' },
      ingest: { state: 'auth_failed' },
    })
    expect(handovers).toEqual(['signedIn:alice', 'signedOut'])
    expect(calls).not.toContain('remove')
  })

  it('サインインしていないときは何もしない（サインアウトの後に届いた 401 など）', async () => {
    const { service, published } = setup()
    await service.prepare()
    service.expire()
    expect(published).toEqual([])
  })
})
