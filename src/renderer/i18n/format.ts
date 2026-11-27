import type { Language } from '../../shared/domain'

const locale = (language: Language) => (language === 'ja' ? 'ja-JP' : 'en-US')

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** 日時を利用者の地域の時刻で出す（保存は UTC。coding-standards.md 4.） */
export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(locale(language), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** 日数（PR の一覧の期間など）。日本語は「7 日」、英語は「7 days」 */
export function formatDays(days: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), {
    style: 'unit',
    unit: 'day',
    unitDisplay: 'long',
  }).format(days)
}

/**
 * 「5分前」のような表し方（component-frontend.md 5.「時刻」）。1分未満は「今」、60分未満は分、24時間未満は時間、それより前は日。
 * 時計のずれで少し先の時刻になっていても「今」とする
 */
export function formatRelativeTime(iso: string, now: Date, language: Language): string {
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' })
  const elapsed = Math.max(0, now.getTime() - Date.parse(iso))
  if (elapsed < MINUTE_MS) return format.format(0, 'second')
  if (elapsed < HOUR_MS) return format.format(-Math.floor(elapsed / MINUTE_MS), 'minute')
  if (elapsed < DAY_MS) return format.format(-Math.floor(elapsed / HOUR_MS), 'hour')
  return format.format(-Math.floor(elapsed / DAY_MS), 'day')
}
