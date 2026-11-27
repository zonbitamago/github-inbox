// デスクトップ通知（component-backend.md 5.4。F-07・F-08・N-09・Q-07）。
// 出すかは core の判定（domain-model.md 4.4。I-6）で決め、Electron の Notification で出す。
// クリックされたら、その出来事を知らせる（組み立てが窓を前に出し、画面に ui:focusEvent を送る）。
// 出せなかったら（Electron の failed）理由を判定して知らせ、次に出せたら知らせを消す。
import type { DesktopNotificationFailure, GitHubEvent, Settings } from '../../shared/domain'
import type { AppState } from '../../shared/ipc-contract'
import { shouldNotify } from '../core/should-notify'
import type { Logger } from '../log/logger'
import { desktopNotificationText, type DesktopNotificationText } from './desktop-notification-text'

export type DesktopNotificationEvent = 'show' | 'click' | 'failed' | 'close'

/** Electron の Notification のうち使うところ（テストでは偽物に差し替える。component-backend.md 9.） */
export interface DesktopNotificationHandle {
  on(name: DesktopNotificationEvent, listener: () => void): void
  show(): void
}

export interface DesktopNotifierDeps {
  isSupported: () => boolean
  create: (text: DesktopNotificationText) => DesktopNotificationHandle
  settings: () => Pick<Settings, 'desktopNotification' | 'language'>
  /** Mac でアプリケーションフォルダの外から開いているか（Mac 以外は false） */
  outsideApplicationsFolder: () => boolean
  now: () => Date
  logger: Logger
  /** 出せなかったことの知らせ（AppState の desktopNotification）を変える */
  publishFailure: (view: AppState['desktopNotification']) => void
  /** クリックされた出来事 */
  focusEvent: (eventId: string) => void
}

/**
 * 出したデスクトップ通知を持っておく数。手放すと、クリックを受け取れなくなることがある（Electron の Notification は
 * 消されるまで持っておく必要がある）。古いものから手放す（AI案）
 */
const RETAINED_LIMIT = 100

export class DesktopNotifier {
  /** もう出した出来事の id（DN-4）。取り戻しの出来事には出さないため、立ち上げてからの分だけ持つ */
  private readonly notified = new Set<string>()
  private readonly retained = new Set<DesktopNotificationHandle>()
  private failing = false

  constructor(private readonly deps: DesktopNotifierDeps) {}

  /** 定期の取り込み（live）で新しく保存した出来事に出す。取り戻し（catchup）の出来事は取り込みから届かない（DN-1） */
  notifyLive(events: readonly GitHubEvent[]): void {
    const settings = this.deps.settings()
    const now = this.deps.now().toISOString()
    const targets = events
      .filter((event) =>
        shouldNotify({
          event,
          mode: 'live',
          now,
          settings: settings.desktopNotification,
          alreadyNotified: this.notified,
        }),
      )
      // 古い順に出す（新しいものが OS の通知の一覧の上に来る）
      .toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    if (targets.length === 0) return
    if (!this.deps.isSupported()) {
      this.fail(targets[0]?.id, 'os_rejected')
      return
    }
    for (const event of targets) {
      this.notified.add(event.id)
      this.show(event, settings.language)
    }
  }

  private show(event: GitHubEvent, language: Settings['language']): void {
    const handle = this.deps.create(desktopNotificationText(event, language))
    this.retain(handle)
    handle.on('show', () => {
      this.deps.logger.info('notify.shown', {
        eventId: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
      })
      if (this.failing) {
        this.failing = false
        this.deps.publishFailure({})
      }
    })
    handle.on('click', () => {
      this.retained.delete(handle)
      this.deps.focusEvent(event.id)
    })
    handle.on('close', () => this.retained.delete(handle))
    handle.on('failed', () => {
      this.retained.delete(handle)
      this.fail(
        event.id,
        this.deps.outsideApplicationsFolder() ? 'outside_applications_folder' : 'os_rejected',
      )
    })
    handle.show()
  }

  private retain(handle: DesktopNotificationHandle): void {
    this.retained.add(handle)
    if (this.retained.size <= RETAINED_LIMIT) return
    const [oldest] = this.retained
    if (oldest !== undefined) this.retained.delete(oldest)
  }

  private fail(eventId: string | undefined, reason: DesktopNotificationFailure): void {
    this.deps.logger.warn('notify.failed', { eventId, reason })
    this.failing = true
    this.deps.publishFailure({ failure: reason, failedAt: this.deps.now().toISOString() })
  }
}
