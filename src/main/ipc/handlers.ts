// 画面からの依頼の受け口と、画面への知らせ（ipc-contract.md、security-rules.md S-08）。
// 受け取った引数はすべて zod で検査し、送り主が本アプリの画面であることを確かめてから処理に渡す。
// 失敗は、Result を返すチャンネルなら値（invalid_argument・internal）で返す。文言はメインから送らない。
import {
  INVOKE_CHANNELS,
  invokeContract,
  pushContract,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
  type IpcErrorCode,
  type PushChannel,
  type PushPayload,
} from '../../shared/ipc-contract'
import type { Logger } from '../log/logger'

export type InvokeHandlers = {
  [C in InvokeChannel]?: (args: InvokeArgs<C>) => Promise<InvokeResult<C>>
}

/** Electron の ipcMain のうち使うもの（テストで偽物に差し替える） */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: { senderFrame: { url: string } | null }, args: unknown) => Promise<unknown>,
  ): void
}

export interface IpcDeps {
  ipcMain: IpcMainLike
  isTrustedSender: (url: string | undefined) => boolean
  logger: Logger
}

const failure = (code: IpcErrorCode) => ({ ok: false as const, error: { code } })

/** そのチャンネルが失敗を値（Result）で返すか。契約のスキーマが失敗の値を受けるかで決める（契約とずれないように） */
function returnsResult(channel: InvokeChannel): boolean {
  return invokeContract[channel].result.safeParse(failure('internal')).success
}

export function registerInvokeHandlers(deps: IpcDeps, handlers: InvokeHandlers): void {
  for (const channel of INVOKE_CHANNELS) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- チャンネルごとに型の違う関数を1つの型で回すため。引数は下で契約のスキーマで検査してから渡す
    const handler = handlers[channel] as ((args: unknown) => Promise<unknown>) | undefined
    if (handler === undefined) continue
    const contract = invokeContract[channel]
    const valueOnFailure = returnsResult(channel)
    deps.ipcMain.handle(channel, async (event, args) => {
      if (!deps.isTrustedSender(event.senderFrame?.url)) {
        deps.logger.warn('ipc.untrusted_sender', { channel })
        throw new Error('untrusted_sender')
      }
      const parsed = contract.args.safeParse(args)
      if (!parsed.success) {
        deps.logger.warn('ipc.invalid_argument', { channel })
        if (valueOnFailure) return failure('invalid_argument')
        throw new Error('invalid_argument')
      }
      try {
        return await handler(parsed.data)
      } catch (error) {
        // 例外の文言には何が入るか分からない（トークンなど）ため、種類だけを書く（S-09）
        deps.logger.error('ipc.internal', {
          channel,
          error: error instanceof Error ? error.name : typeof error,
        })
        if (valueOnFailure) return failure('internal')
        throw new Error('internal')
      }
    })
  }
}

/**
 * 送り主の確認。配布物では読み込んだ自分の index.html（file:）だけ、開発中は開発サーバーも通す。
 * URL の後ろの `#…`・`?…` は見ない。
 */
export function createSenderCheck(options: {
  indexFileUrl: string
  devServerUrl?: string
}): (url: string | undefined) => boolean {
  const withoutQuery = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`
  const index = withoutQuery(new URL(options.indexFileUrl))
  const devOrigin =
    options.devServerUrl === undefined ? undefined : new URL(options.devServerUrl).origin
  return (url) => {
    if (url === undefined) return false
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (devOrigin !== undefined && parsed.origin === devOrigin) return true
    return withoutQuery(parsed) === index
  }
}

/** 知らせを送る先（Electron の webContents のうち使うもの） */
export interface PushTarget {
  send(channel: string, payload: unknown): void
  isDestroyed(): boolean
}

export interface Pusher {
  send<C extends PushChannel>(channel: C, payload: PushPayload<C>): void
}

/** 画面への知らせ。契約に合わないものは送らずにログに残す（メインと画面のずれを早く見つけるため） */
export function createPusher(getTarget: () => PushTarget | null, logger: Logger): Pusher {
  return {
    send(channel, payload) {
      if (!pushContract[channel].safeParse(payload).success) {
        logger.error('ipc.invalid_push', { channel })
        return
      }
      const target = getTarget()
      if (target === null || target.isDestroyed()) return
      target.send(channel, payload)
    },
  }
}
