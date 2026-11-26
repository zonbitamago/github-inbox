// デスクトップ通知を出すかの判定（domain-model.md 4.4。I-6）。DN-1〜4 のすべてに当たるときだけ出す。
import type { DesktopNotificationSettings, GitHubEvent, IngestMode } from '../../shared/domain'
import { DESKTOP_NOTIFICATION_WINDOW_MS } from './constants'

export interface ShouldNotifyInput {
  event: GitHubEvent
  mode: IngestMode
  /** 今の時刻（ISO 8601。core は時計に触れない） */
  now: string
  settings: DesktopNotificationSettings
  /** もうデスクトップ通知を出した出来事の id */
  alreadyNotified: ReadonlySet<string>
}

export function shouldNotify(input: ShouldNotifyInput): boolean {
  const { event, settings } = input
  // DN-1: 立ち上げ時の取り戻しでは出さない
  if (input.mode !== 'live') return false
  // DN-2: 発生から10分以内だけ（未来の時刻は時計のずれとして出す）
  if (Date.parse(input.now) - Date.parse(event.occurredAt) > DESKTOP_NOTIFICATION_WINDOW_MS)
    return false
  // DN-3: その種類がオン。bot の出来事は bot の設定もオン
  if (!settings.byType[event.type]) return false
  if (event.actor.isBot && !settings.bots) return false
  // DN-4: まだ出していない
  return !input.alreadyNotified.has(event.id)
}
