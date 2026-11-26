import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type GitHubEvent } from '../../shared/domain'
import { shouldNotify } from './should-notify'

const NOW = '2026-01-31T00:00:00.000Z'
const minutesBefore = (minutes: number, extraMs = 0) =>
  new Date(Date.parse(NOW) - minutes * 60 * 1000 - extraMs).toISOString()

const event: GitHubEvent = {
  id: 'IC_example',
  type: 'comment',
  target: {
    kind: 'pull_request',
    repository: 'example-org/app',
    number: 101,
    title: 'ログイン画面の文言を直す',
    url: 'https://github.com/example-org/app/pull/101',
  },
  actor: { login: 'bob', isBot: false },
  occurredAt: minutesBefore(1),
  url: 'https://github.com/example-org/app/pull/101#issuecomment-1',
  receivedAt: NOW,
}

const base = {
  event,
  mode: 'live' as const,
  now: NOW,
  settings: DEFAULT_SETTINGS.desktopNotification,
  alreadyNotified: new Set<string>(),
}

// domain-model.md 4.4: DN-1〜4 のすべてに当たるときだけ出す
describe('デスクトップ通知を出すか', () => {
  it('すべてに当たれば出す', () => {
    expect(shouldNotify(base)).toBe(true)
  })

  it('DN-1: 立ち上げ時の取り戻し（catchup）では出さない', () => {
    expect(shouldNotify({ ...base, mode: 'catchup' })).toBe(false)
  })

  it.each([
    ['ちょうど10分前', minutesBefore(10), true],
    ['10分と1ミリ秒前', minutesBefore(10, 1), false],
    ['1時間前', minutesBefore(60), false],
    ['未来（時計のずれ）', minutesBefore(-1), true],
  ])('DN-2: 発生から10分以内だけ（%s）', (_name, occurredAt, expected) => {
    expect(shouldNotify({ ...base, event: { ...event, occurredAt } })).toBe(expected)
  })

  it('DN-3: その種類をオフにしていれば出さない', () => {
    const settings = {
      ...base.settings,
      byType: { ...base.settings.byType, comment: false },
    }
    expect(shouldNotify({ ...base, settings })).toBe(false)
  })

  it.each([
    [true, true],
    [false, false],
  ])('DN-3: bot の出来事は、bot の設定にも従う（bot の設定 %s → %s）', (bots, expected) => {
    expect(
      shouldNotify({
        ...base,
        event: { ...event, actor: { login: 'example-bot', isBot: true } },
        settings: { ...base.settings, bots },
      }),
    ).toBe(expected)
  })

  it('DN-3: bot でない出来事は、bot の設定に左右されない', () => {
    expect(shouldNotify({ ...base, settings: { ...base.settings, bots: false } })).toBe(true)
  })

  it('DN-4: もう出した出来事には出さない', () => {
    expect(shouldNotify({ ...base, alreadyNotified: new Set([event.id]) })).toBe(false)
  })
})
