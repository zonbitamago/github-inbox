// 画面とメインが共有する型・区分値・設定の既定値（domain-model.md 2.・6.）。
// 値は business-data.md・domain-model.md 6. のコードをそのまま使う。変えるときは文書を先に直す（src/shared/CLAUDE.md）。
// 型は zod のスキーマから作る。保存したファイルや IPC の値は、このスキーマで検査する（I-3）。
import { z } from 'zod'

// ---- 業務の区分値（business-data.md 2.） ----

/** 出来事の種類（business-data.md 2.1） */
export const EVENT_TYPES = [
  'review_requested',
  'review',
  'comment',
  'ci',
  'mention',
  'assign',
  'participating',
] as const
export const EventTypeSchema = z.enum(EVENT_TYPES)
export type EventType = z.infer<typeof EventTypeSchema>

/** レビューの結果（business-data.md 2.2） */
export const REVIEW_RESULTS = ['approved', 'changes_requested', 'commented'] as const
export const ReviewResultSchema = z.enum(REVIEW_RESULTS)
export type ReviewResult = z.infer<typeof ReviewResultSchema>

/** PR の状態（business-data.md 2.4） */
export const PULL_REQUEST_STATES = ['open', 'draft', 'merged', 'closed'] as const
export const PullRequestStateSchema = z.enum(PULL_REQUEST_STATES)
export type PullRequestState = z.infer<typeof PullRequestStateSchema>

/** 自分待ちの理由（business-data.md 2.5）。表示の順もこの順 */
export const WAITING_REASONS = [
  'review_pending',
  'changes_requested',
  'ci_failed',
  'approved',
  'assigned',
] as const
export const WaitingReasonSchema = z.enum(WAITING_REASONS)
export type WaitingReason = z.infer<typeof WaitingReasonSchema>

// ---- 技術上の区分値（domain-model.md 6.） ----

export const TARGET_KINDS = ['pull_request', 'issue', 'workflow_run'] as const
export const TargetKindSchema = z.enum(TARGET_KINDS)
export type TargetKind = z.infer<typeof TargetKindSchema>

export const INGEST_MODES = ['catchup', 'live'] as const
export const IngestModeSchema = z.enum(INGEST_MODES)
export type IngestMode = z.infer<typeof IngestModeSchema>

export const INGEST_STATES = [
  'ok',
  'syncing',
  'offline',
  'auth_failed',
  'rate_limited',
  'github_error',
  'signed_out',
] as const
export const IngestStateSchema = z.enum(INGEST_STATES)
export type IngestState = z.infer<typeof IngestStateSchema>

export const DESKTOP_NOTIFICATION_FAILURES = ['outside_applications_folder', 'os_rejected'] as const
export const DesktopNotificationFailureSchema = z.enum(DESKTOP_NOTIFICATION_FAILURES)
export type DesktopNotificationFailure = z.infer<typeof DesktopNotificationFailureSchema>

export const LAYOUTS = ['tabs', 'side_by_side'] as const
export const LayoutSchema = z.enum(LAYOUTS)
export type Layout = z.infer<typeof LayoutSchema>

export const LANGUAGES = ['ja', 'en'] as const
export const LanguageSchema = z.enum(LANGUAGES)
export type Language = z.infer<typeof LanguageSchema>

export const AUTH_METHODS = ['device_flow', 'pat'] as const
export const AuthMethodSchema = z.enum(AUTH_METHODS)
export type AuthMethod = z.infer<typeof AuthMethodSchema>

export const AUTH_STATUSES = [
  'signed_out',
  'keychain_notice',
  'signing_in',
  'signed_in',
  'auth_failed',
] as const
export const AuthStatusSchema = z.enum(AUTH_STATUSES)
export type AuthStatus = z.infer<typeof AuthStatusSchema>

// ---- 型（domain-model.md 2.） ----

/** 時刻は UTC の ISO 8601 の文字列（coding-standards.md 4.） */
export const IsoDateTimeSchema = z.iso.datetime()

/** "owner/name" */
export const RepositorySchema = z.string().regex(/^[^/\s]+\/[^/\s]+$/)

export const ActorSchema = z.strictObject({
  login: z.string().min(1),
  isBot: z.boolean(),
})
export type Actor = z.infer<typeof ActorSchema>

export const TargetSchema = z.strictObject({
  kind: TargetKindSchema,
  repository: RepositorySchema,
  /** workflow_run には無い */
  number: z.int().positive().optional(),
  title: z.string(),
  /** PR・issue・ワークフロー実行のページ */
  url: z.string().min(1),
})
export type Target = z.infer<typeof TargetSchema>

/**
 * 出来事。id は出典の node ID（domain-model.md 3.）。
 * reviewResult は type = 'review'、ciConclusion は type = 'ci'、viaTeam は type = 'review_requested' のときだけ持つ。
 * url を外で開く・コピーするときは、main/core の URL の検査（I-8）を必ず通す。ここでは形だけを見る。
 */
export const GitHubEventSchema = z
  .strictObject({
    id: z.string().min(1),
    type: EventTypeSchema,
    reviewResult: ReviewResultSchema.optional(),
    /** GitHub の値のまま（success、failure など。business-data.md 2.3） */
    ciConclusion: z.string().min(1).optional(),
    /** チーム宛てのレビュー依頼（F-03） */
    viaTeam: z.boolean().optional(),
    target: TargetSchema,
    actor: ActorSchema,
    occurredAt: IsoDateTimeSchema,
    /** 本文の抜粋。Markdown の記号は落とさず、文字としてだけ出す（S-05） */
    excerpt: z.string().optional(),
    /** 出来事そのもののページ（コメントのアンカーなど） */
    url: z.string().min(1),
    receivedAt: IsoDateTimeSchema,
  })
  .superRefine((event, ctx) => {
    const onlyFor = (field: 'reviewResult' | 'ciConclusion' | 'viaTeam', type: EventType) => {
      if (event[field] !== undefined && event.type !== type) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} は type = '${type}' のときだけ`,
        })
      }
    }
    onlyFor('reviewResult', 'review')
    onlyFor('ciConclusion', 'ci')
    onlyFor('viaTeam', 'review_requested')
  })
export type GitHubEvent = z.infer<typeof GitHubEventSchema>

export const PullRequestItemSchema = z.strictObject({
  /** PR の node ID */
  id: z.string().min(1),
  repository: RepositorySchema,
  number: z.int().positive(),
  title: z.string(),
  url: z.string().min(1),
  state: PullRequestStateSchema,
  author: ActorSchema,
  updatedAt: IsoDateTimeSchema,
  /** 空なら自分待ちではない */
  waitingReasons: z.array(WaitingReasonSchema),
})
export type PullRequestItem = z.infer<typeof PullRequestItemSchema>

/** 日数（PR の一覧の期間・出来事の一覧の日数）。1〜30 の整数（F-16・F-32） */
export const DAYS_MIN = 1
export const DAYS_MAX = 30
export const DaysSchema = z.int().min(DAYS_MIN).max(DAYS_MAX)

export const DesktopNotificationSettingsSchema = z.strictObject({
  byType: z.record(EventTypeSchema, z.boolean()),
  /** bot の発言（D-014） */
  bots: z.boolean(),
})
export type DesktopNotificationSettings = z.infer<typeof DesktopNotificationSettingsSchema>

export const SettingsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  desktopNotification: DesktopNotificationSettingsSchema,
  prPeriodDays: DaysSchema,
  eventDays: DaysSchema,
  layout: LayoutSchema,
  language: LanguageSchema,
  onboarding: z.strictObject({ completedAt: IsoDateTimeSchema.optional() }),
  /** F-36 (5) の判定に使う */
  lastLaunchedVersion: z.string().min(1).optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

// ---- 設定の既定値（coding-standards.md 4. の「設定の既定値は shared の1か所」） ----

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  desktopNotification: {
    // 既定はすべて出す（domain-model.md 2.）
    byType: {
      review_requested: true,
      review: true,
      comment: true,
      ci: true,
      mention: true,
      assign: true,
      participating: true,
    },
    // bot の発言も既定で出す（D-014）
    bots: true,
  },
  prPeriodDays: 7, // F-16
  eventDays: 7, // F-32
  layout: 'tabs', // AI案（domain-model.md 2.）
  language: 'ja',
  onboarding: {},
}
