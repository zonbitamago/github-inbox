import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import { createSettingsUpdater } from './settings-change'

function setup(initial: Settings = DEFAULT_SETTINGS) {
  let settings = structuredClone(initial)
  const published: Settings[] = []
  const eventDays: number[] = []
  let prPeriodChanged = 0
  const update = createSettingsUpdater({
    current: () => structuredClone(settings),
    save: (patch) => {
      settings = { ...settings, ...patch }
      return Promise.resolve(structuredClone(settings))
    },
    publish: (saved) => published.push(saved),
    eventDaysChanged: (days) => eventDays.push(days),
    prPeriodChanged: () => {
      prPeriodChanged += 1
    },
  })
  return { update, published, eventDays, prPeriodChangedCount: () => prPeriodChanged }
}

// ipc-contract.md 2. の settings:update、component-frontend.md 4.「設定の変更」
describe('設定を変える（settings:update）', () => {
  it('保存して、画面に新しい設定を知らせ、保存した設定を返す', async () => {
    const { update, published } = setup()
    const result = await update({ language: 'en', layout: 'side_by_side' })

    const expected = { ...DEFAULT_SETTINGS, language: 'en', layout: 'side_by_side' }
    expect(result).toEqual({ ok: true, value: expected })
    expect(published).toEqual([expected])
  })

  it('出来事の一覧の日数を変えたら、一覧を入れ替える（F-32、AC-34）', async () => {
    const { update, eventDays, prPeriodChangedCount } = setup()
    await update({ eventDays: 3 })

    expect(eventDays).toEqual([3])
    expect(prPeriodChangedCount()).toBe(0)
  })

  it('PR の一覧の期間を変えたら、取り直す。出来事の一覧は変えない（F-16、AC-19）', async () => {
    const { update, eventDays, prPeriodChangedCount } = setup()
    await update({ prPeriodDays: 30 })

    expect(prPeriodChangedCount()).toBe(1)
    expect(eventDays).toEqual([])
  })

  it('同じ値なら、一覧の入れ替えも取り直しもしない', async () => {
    const { update, eventDays, prPeriodChangedCount } = setup()
    await update({
      eventDays: DEFAULT_SETTINGS.eventDays,
      prPeriodDays: DEFAULT_SETTINGS.prPeriodDays,
    })

    expect(eventDays).toEqual([])
    expect(prPeriodChangedCount()).toBe(0)
  })

  it('デスクトップ通知の設定は丸ごと置き換える（ipc-contract.md 2.）', async () => {
    const { update } = setup()
    const desktopNotification = {
      byType: { ...DEFAULT_SETTINGS.desktopNotification.byType, ci: false },
      bots: false,
    }
    const result = await update({ desktopNotification })

    expect(result.ok ? result.value.desktopNotification : undefined).toEqual(desktopNotification)
  })
})
