// 設定を変える（ipc-contract.md 2. の settings:update、component-frontend.md 4.）。
// 保存して画面に知らせ、変わった値に応じて一覧を合わせる。
// 出来事の一覧の日数（F-32）が変わったら、保存してある出来事から一覧を入れ替える（取り直さない。domain-model.md 5.）。
// PR の一覧の期間（F-16）が変わったら、取得中でも取り直す。
// デスクトップ通知・言語は、使う側が毎回 current を読むので、ここでは何もしない。並べ方は画面だけで使う。
import type { Settings } from '../../shared/domain'
import type { Result, SettingsPatch } from '../../shared/ipc-contract'

export interface SettingsChangeDeps {
  current: () => Settings
  save: (patch: SettingsPatch) => Promise<Settings>
  /** AppState.settings を変える（state:changed） */
  publish: (settings: Settings) => void
  /** 出来事の一覧を、新しい日数で入れ替える（events:reset） */
  eventDaysChanged: (eventDays: number) => void
  /** PR の一覧を、新しい期間で取り直す */
  prPeriodChanged: () => void
}

export function createSettingsUpdater(
  deps: SettingsChangeDeps,
): (patch: SettingsPatch) => Promise<Result<Settings>> {
  return async (patch) => {
    const before = deps.current()
    const saved = await deps.save(patch)
    deps.publish(saved)
    if (saved.eventDays !== before.eventDays) deps.eventDaysChanged(saved.eventDays)
    if (saved.prPeriodDays !== before.prPeriodDays) deps.prPeriodChanged()
    return { ok: true, value: saved }
  }
}
