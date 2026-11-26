import type { Language } from '../../shared/domain'

/** 日時を利用者の地域の時刻で出す（保存は UTC。coding-standards.md 4.）。「5分前」の形は S3 で足す */
export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
