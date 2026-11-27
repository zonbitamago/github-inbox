import { describe, expect, it } from 'vitest'
import { formatDays, formatRelativeTime } from './format'

const NOW = new Date('2026-01-31T12:00:00Z')

// component-frontend.md 5.「時刻」
describe('「5分前」のような表し方', () => {
  it.each([
    ['1分未満は「今」', '2026-01-31T11:59:01Z', '今', 'now'],
    ['時計のずれで先の時刻でも「今」', '2026-01-31T12:00:30Z', '今', 'now'],
    ['境目: ちょうど1分', '2026-01-31T11:59:00Z', '1 分前', '1 minute ago'],
    ['分', '2026-01-31T11:55:00Z', '5 分前', '5 minutes ago'],
    ['境目: 59分', '2026-01-31T11:01:00Z', '59 分前', '59 minutes ago'],
    ['境目: ちょうど1時間', '2026-01-31T11:00:00Z', '1 時間前', '1 hour ago'],
    ['時間', '2026-01-31T09:00:00Z', '3 時間前', '3 hours ago'],
    ['境目: ちょうど1日', '2026-01-30T12:00:00Z', '昨日', 'yesterday'],
    ['日', '2026-01-25T00:00:00Z', '6 日前', '6 days ago'],
  ])('%s', (_name, iso, ja, en) => {
    expect(formatRelativeTime(iso, NOW, 'ja')).toBe(ja)
    expect(formatRelativeTime(iso, NOW, 'en')).toBe(en)
  })
})

describe('日数の表し方（PR の一覧の期間）', () => {
  it.each([
    [1, '1 日', '1 day'],
    [7, '7 日', '7 days'],
    [30, '30 日', '30 days'],
  ])('%i 日', (days, ja, en) => {
    expect(formatDays(days, 'ja')).toBe(ja)
    expect(formatDays(days, 'en')).toBe(en)
  })
})
