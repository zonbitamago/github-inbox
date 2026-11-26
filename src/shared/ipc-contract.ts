// 画面とメインの間の契約（ipc-contract.md）。これが唯一の正で、型はスキーマから作る。
// チャンネルを足す・変えるときは、ipc-contract.md を先に直す（src/shared/CLAUDE.md）。
// トークンを運ぶのは auth:submitPat の引数だけ（I-7）。
import { z } from 'zod'
import {
  AuthMethodSchema,
  AuthStatusSchema,
  DaysSchema,
  DesktopNotificationFailureSchema,
  DesktopNotificationSettingsSchema,
  GitHubEventSchema,
  IngestStateSchema,
  IsoDateTimeSchema,
  LanguageSchema,
  LayoutSchema,
  PullRequestItemSchema,
  SettingsSchema,
} from './domain'

// ---- 失敗の返し方（ipc-contract.md 4.） ----

export const IPC_ERROR_CODES = [
  'invalid_argument',
  'not_signed_in',
  'offline',
  'auth_failed',
  'rate_limited',
  'github_error',
  'url_not_allowed',
  'pat_invalid',
  'pat_missing_scope',
  'device_flow_expired',
  'device_flow_denied',
  'encryption_unavailable',
  'not_supported',
  'internal',
] as const
export const IpcErrorCodeSchema = z.enum(IPC_ERROR_CODES)
export type IpcErrorCode = z.infer<typeof IpcErrorCodeSchema>

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: IpcErrorCode } }

const FailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({ code: IpcErrorCodeSchema }),
})

export function resultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true), value }), FailureSchema])
}

/** Result<void> の value。IPC で undefined の項目が落ちても通るように、項目そのものを省いてよい */
const VoidValueSchema = z.undefined().optional()

// ---- 共有の形（ipc-contract.md 3.） ----

export const PrListSnapshotSchema = z.strictObject({
  /** 更新の新しい順 */
  items: z.array(PullRequestItemSchema),
  periodDays: DaysSchema,
  fetchedAt: IsoDateTimeSchema,
})
export type PrListSnapshot = z.infer<typeof PrListSnapshotSchema>

export const DEVICE_FLOW_STATUSES = ['waiting', 'expired', 'denied'] as const

export const AppStateSchema = z.strictObject({
  appInfo: z.strictObject({
    version: z.string().min(1),
    platform: z.enum(['darwin', 'win32']),
    /** Mac 以外は null */
    inApplicationsFolder: z.boolean().nullable(),
  }),
  auth: z.strictObject({
    status: AuthStatusSchema,
    /** GitHub のユーザー名（トークンではない） */
    login: z.string().min(1).optional(),
    method: AuthMethodSchema.optional(),
    deviceFlow: z
      .strictObject({
        userCode: z.string().min(1),
        verificationUri: z.string().min(1),
        expiresAt: IsoDateTimeSchema,
        status: z.enum(DEVICE_FLOW_STATUSES),
      })
      .optional(),
  }),
  ingest: z.strictObject({
    state: IngestStateSchema,
    lastSuccessAt: IsoDateTimeSchema.optional(),
    retryAt: IsoDateTimeSchema.optional(),
  }),
  desktopNotification: z.strictObject({
    failure: DesktopNotificationFailureSchema.optional(),
    failedAt: IsoDateTimeSchema.optional(),
  }),
  settings: SettingsSchema,
  loginItem: z.strictObject({ enabled: z.boolean() }),
  onboardingRequired: z.boolean(),
  /** F-31。url は Releases のページ */
  update: z.strictObject({ version: z.string().min(1), url: z.string().min(1) }).optional(),
  prList: z.strictObject({
    loading: z.boolean(),
    error: IpcErrorCodeSchema.optional(),
  }),
})
export type AppState = z.infer<typeof AppStateSchema>

/**
 * 設定のうち画面から変えられるもの（ipc-contract.md 2.）。最上位の項目の一部を送る。
 * desktopNotification は丸ごと送る。onboarding・lastLaunchedVersion は画面からは変えられない。
 */
export const SettingsPatchSchema = z.strictObject({
  desktopNotification: DesktopNotificationSettingsSchema.optional(),
  prPeriodDays: DaysSchema.optional(),
  eventDays: DaysSchema.optional(),
  layout: LayoutSchema.optional(),
  language: LanguageSchema.optional(),
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

// ---- 画面からメインへの依頼（ipc-contract.md 2.） ----

/** 引数の無いチャンネル */
const NoArgsSchema = z.undefined()

export const invokeContract = {
  'app:getState': { args: NoArgsSchema, result: AppStateSchema },
  /** 出来事の一覧の日数以内、発生の新しい順 */
  'events:list': { args: NoArgsSchema, result: z.array(GitHubEventSchema) },
  /** 最後に取った一覧 */
  'prs:get': { args: NoArgsSchema, result: PrListSnapshotSchema.nullable() },
  /** 取得中なら、その取得の結果を返す */
  'prs:reload': { args: NoArgsSchema, result: resultSchema(PrListSnapshotSchema) },
  'settings:update': { args: SettingsPatchSchema, result: resultSchema(SettingsSchema) },
  'loginItem:set': {
    args: z.strictObject({ enabled: z.boolean() }),
    result: resultSchema(z.strictObject({ enabled: z.boolean() })),
  },
  'auth:startDeviceFlow': {
    args: NoArgsSchema,
    result: resultSchema(
      z.strictObject({
        userCode: z.string().min(1),
        verificationUri: z.string().min(1),
        expiresAt: IsoDateTimeSchema,
      }),
    ),
  },
  'auth:cancelDeviceFlow': { args: NoArgsSchema, result: resultSchema(VoidValueSchema) },
  /** PAT を画面からメインへ一度だけ送る（I-7） */
  'auth:submitPat': {
    args: z.strictObject({ token: z.string().min(1).max(255) }),
    result: resultSchema(z.strictObject({ login: z.string().min(1) })),
  },
  'auth:continueAfterKeychainNotice': { args: NoArgsSchema, result: resultSchema(VoidValueSchema) },
  'auth:signOut': { args: NoArgsSchema, result: resultSchema(VoidValueSchema) },
  /** https://github.com/ のものでなければ url_not_allowed（検査は main/core の URL の検査。I-8） */
  'shell:openGitHub': {
    args: z.strictObject({ url: z.string() }),
    result: resultSchema(VoidValueSchema),
  },
  /** 1件でも検査に通らなければ全体を断る */
  'clipboard:copyLinks': {
    args: z.strictObject({ urls: z.array(z.string()).max(1000) }),
    result: resultSchema(z.strictObject({ count: z.int().nonnegative() })),
  },
  /** 開く先はメインが OS ごとに決める。画面から URL は渡さない */
  'os:openNotificationSettings': { args: NoArgsSchema, result: resultSchema(VoidValueSchema) },
  /** 成功するとアプリは移った先で開き直す */
  'onboarding:moveToApplicationsFolder': {
    args: NoArgsSchema,
    result: resultSchema(VoidValueSchema),
  },
  /** 5秒待って、出た・失敗した・分からない */
  'onboarding:sendTestNotification': {
    args: NoArgsSchema,
    result: resultSchema(z.strictObject({ outcome: z.enum(['shown', 'failed', 'unknown']) })),
  },
  'onboarding:complete': { args: NoArgsSchema, result: resultSchema(VoidValueSchema) },
} as const satisfies Record<string, { args: z.ZodType; result: z.ZodType }>

export type InvokeContract = typeof invokeContract
export type InvokeChannel = keyof InvokeContract
export const INVOKE_CHANNELS = Object.keys(invokeContract) as InvokeChannel[]
export type InvokeArgs<C extends InvokeChannel> = z.infer<InvokeContract[C]['args']>
export type InvokeResult<C extends InvokeChannel> = z.infer<InvokeContract[C]['result']>

// ---- メインから画面への知らせ（ipc-contract.md 3.） ----

export const pushContract = {
  'state:changed': AppStateSchema,
  /** 新しく増えた分 */
  'events:added': z.array(GitHubEventSchema),
  /** 一覧の全体 */
  'events:reset': z.array(GitHubEventSchema),
  'prs:updated': PrListSnapshotSchema,
  /** デスクトップ通知がクリックされたとき（F-08） */
  'ui:focusEvent': z.strictObject({ eventId: z.string().min(1) }),
} as const satisfies Record<string, z.ZodType>

export type PushContract = typeof pushContract
export type PushChannel = keyof PushContract
export const PUSH_CHANNELS = Object.keys(pushContract) as PushChannel[]
export type PushPayload<C extends PushChannel> = z.infer<PushContract[C]>

// ---- preload が画面に出す関数（window.githubInbox。ipc-contract.md 1.） ----

export interface GithubInboxApi {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C> extends undefined ? [] : [InvokeArgs<C>]
  ): Promise<InvokeResult<C>>
  /** 戻り値の関数を呼ぶと受け取りをやめる */
  on<C extends PushChannel>(channel: C, listener: (payload: PushPayload<C>) => void): () => void
}

export function isInvokeChannel(value: unknown): value is InvokeChannel {
  return typeof value === 'string' && Object.hasOwn(invokeContract, value)
}

export function isPushChannel(value: unknown): value is PushChannel {
  return typeof value === 'string' && Object.hasOwn(pushContract, value)
}
