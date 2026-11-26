import { describe, expect, it, vi } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { buildAppState } from '../app/app-state'
import {
  createPusher,
  createSenderCheck,
  registerInvokeHandlers,
  type InvokeHandlers,
} from './handlers'

const TRUSTED =
  'file:///Applications/github-inbox.app/Contents/Resources/app.asar/out/renderer/index.html'

function setup(handlers: InvokeHandlers) {
  const registered = new Map<
    string,
    (event: { senderFrame: { url: string } | null }, args: unknown) => Promise<unknown>
  >()
  const ipcMain = {
    handle: vi.fn(
      (
        channel: string,
        listener: (
          event: { senderFrame: { url: string } | null },
          args: unknown,
        ) => Promise<unknown>,
      ) => registered.set(channel, listener),
    ),
  }
  const logger = createMemoryLogger()
  registerInvokeHandlers(
    { ipcMain, isTrustedSender: createSenderCheck({ indexFileUrl: TRUSTED }), logger },
    handlers,
  )
  const call = (channel: string, args?: unknown, url: string | null = TRUSTED) => {
    const listener = registered.get(channel)
    if (listener === undefined) throw new Error(`${channel} は登録されていない`)
    return listener({ senderFrame: url === null ? null : { url } }, args)
  }
  return { registered, call, logger }
}

const state = buildAppState({
  version: '0.1.0',
  platform: 'darwin',
  inApplicationsFolder: true,
  settings: DEFAULT_SETTINGS,
  loginItemEnabled: false,
  auth: { status: 'signed_out' },
  ingest: { state: 'signed_out' },
  desktopNotification: {},
  prList: { loading: false },
})

// security-rules.md S-08、ipc-contract.md 1.・4.
describe('IPC の受け口', () => {
  it('渡した受け口だけを登録する', () => {
    const { registered } = setup({
      'app:getState': () => Promise.resolve(state),
      'events:list': () => Promise.resolve([]),
    })
    expect([...registered.keys()]).toEqual(['app:getState', 'events:list'])
  })

  it('本アプリの画面から頼まれたら、処理の結果を返す', async () => {
    const { call } = setup({ 'app:getState': () => Promise.resolve(state) })
    await expect(call('app:getState')).resolves.toEqual(state)
  })

  it('送り主が本アプリの画面でなければ断り、ログに残す', async () => {
    const { call, logger } = setup({ 'app:getState': () => Promise.resolve(state) })
    await expect(call('app:getState', undefined, 'https://example.com/')).rejects.toThrow()
    await expect(call('app:getState', undefined, null)).rejects.toThrow()
    expect(logger.entries.map((entry) => entry.kind)).toEqual([
      'ipc.untrusted_sender',
      'ipc.untrusted_sender',
    ])
  })

  it('失敗を値で返すチャンネルは、引数が契約に合わなければ invalid_argument を返す', async () => {
    const handler = vi.fn(() => Promise.resolve({ ok: true as const, value: { enabled: true } }))
    const { call, logger } = setup({ 'loginItem:set': handler })
    await expect(call('loginItem:set', { enabled: 'yes' })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_argument' },
    })
    await expect(call('loginItem:set', { enabled: true, extra: 1 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_argument' },
    })
    expect(handler).not.toHaveBeenCalled()
    expect(logger.entries.map((entry) => entry.kind)).toEqual([
      'ipc.invalid_argument',
      'ipc.invalid_argument',
    ])
  })

  it('値を返すだけのチャンネルは、引数があれば断る', async () => {
    const { call } = setup({ 'events:list': () => Promise.resolve([]) })
    await expect(call('events:list', { unexpected: true })).rejects.toThrow()
  })

  it('検査に通った値だけを処理に渡す', async () => {
    const handler = vi.fn((args: { enabled: boolean }) =>
      Promise.resolve({ ok: true as const, value: args }),
    )
    const { call } = setup({ 'loginItem:set': handler })
    await expect(call('loginItem:set', { enabled: true })).resolves.toEqual({
      ok: true,
      value: { enabled: true },
    })
    expect(handler).toHaveBeenCalledWith({ enabled: true })
  })

  it('想定外の例外は、失敗を値で返すチャンネルなら internal にし、ログには例外の種類だけを書く', async () => {
    const { call, logger } = setup({
      'auth:signOut': () => Promise.reject(new TypeError('ghp_' + 'a'.repeat(36))),
    })
    await expect(call('auth:signOut')).resolves.toEqual({ ok: false, error: { code: 'internal' } })
    expect(logger.entries).toEqual([
      {
        level: 'error',
        kind: 'ipc.internal',
        fields: { channel: 'auth:signOut', error: 'TypeError' },
      },
    ])
  })

  it('値を返すだけのチャンネルの想定外の例外は、画面の側で失敗にする（文言は渡さない）', async () => {
    const { call } = setup({
      'events:list': () => Promise.reject(new Error('秘密の中身')),
    })
    await expect(call('events:list')).rejects.toThrow('internal')
  })
})

describe('送り主の確認', () => {
  it.each([
    [TRUSTED, true],
    [`${TRUSTED}#main`, true],
    [`${TRUSTED}?x=1`, true],
    ['file:///tmp/other/index.html', false],
    ['https://github.com/', false],
    [undefined, false],
    ['not a url', false],
  ])('配布物: %s → %s', (url, expected) => {
    expect(createSenderCheck({ indexFileUrl: TRUSTED })(url)).toBe(expected)
  })

  it.each([
    ['http://localhost:5173/', true],
    ['http://localhost:5173/index.html', true],
    ['http://localhost:5174/', false],
    [TRUSTED, true],
  ])('開発中（開発サーバー）: %s → %s', (url, expected) => {
    expect(
      createSenderCheck({ indexFileUrl: TRUSTED, devServerUrl: 'http://localhost:5173' })(url),
    ).toBe(expected)
  })
})

describe('メインから画面への知らせ', () => {
  it('契約に合う知らせを送る', () => {
    const send = vi.fn()
    const pusher = createPusher(() => ({ send, isDestroyed: () => false }), createMemoryLogger())
    pusher.send('ui:focusEvent', { eventId: 'IC_1' })
    expect(send).toHaveBeenCalledWith('ui:focusEvent', { eventId: 'IC_1' })
  })

  it('契約に合わない知らせは送らず、ログに残す（ずれを早く見つけるため）', () => {
    const send = vi.fn()
    const logger = createMemoryLogger()
    const pusher = createPusher(() => ({ send, isDestroyed: () => false }), logger)
    pusher.send('ui:focusEvent', { eventId: '' })
    expect(send).not.toHaveBeenCalled()
    expect(logger.entries).toEqual([
      { level: 'error', kind: 'ipc.invalid_push', fields: { channel: 'ui:focusEvent' } },
    ])
  })

  it('窓が無い・閉じたあとは送らない', () => {
    const send = vi.fn()
    createPusher(() => null, createMemoryLogger()).send('ui:focusEvent', { eventId: 'IC_1' })
    createPusher(() => ({ send, isDestroyed: () => true }), createMemoryLogger()).send(
      'ui:focusEvent',
      { eventId: 'IC_1' },
    )
    expect(send).not.toHaveBeenCalled()
  })
})
