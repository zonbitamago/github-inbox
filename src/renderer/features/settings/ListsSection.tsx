// 一覧の設定: 出来事の一覧の日数（F-32）、PR の一覧の期間（F-16）、並べ方（F-33）。日数は1〜30（0日・31日は選べない。AC-19）。
import { DAYS_MAX, DAYS_MIN, LAYOUTS, type Layout, type Settings } from '../../../shared/domain'
import type { SettingsPatch } from '../../../shared/ipc-contract'
import { useLanguage, useT } from '../../i18n'
import { formatDays } from '../../i18n/format'
import { Select } from '../../ui/Select'
import { SettingsSection } from './SettingsSection'

const DAYS = Array.from({ length: DAYS_MAX - DAYS_MIN + 1 }, (_, index) => DAYS_MIN + index)

const isLayout = (value: string): value is Layout => LAYOUTS.some((layout) => layout === value)

function toDays(value: string): number | undefined {
  const days = Number(value)
  return Number.isInteger(days) && days >= DAYS_MIN && days <= DAYS_MAX ? days : undefined
}

export function ListsSection({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (patch: SettingsPatch) => void
}) {
  const t = useT()
  const language = useLanguage()
  const dayOptions = DAYS.map((days) => ({
    value: String(days),
    label: formatDays(days, language),
  }))
  return (
    <SettingsSection title={t('settings.lists.title')}>
      <Select
        label={t('settings.lists.eventDays')}
        value={String(settings.eventDays)}
        options={dayOptions}
        onChange={(value) => {
          const eventDays = toDays(value)
          if (eventDays !== undefined) onChange({ eventDays })
        }}
      />
      <Select
        label={t('settings.lists.prPeriodDays')}
        value={String(settings.prPeriodDays)}
        options={dayOptions}
        onChange={(value) => {
          const prPeriodDays = toDays(value)
          if (prPeriodDays !== undefined) onChange({ prPeriodDays })
        }}
      />
      <Select
        label={t('settings.lists.layout')}
        value={settings.layout}
        options={LAYOUTS.map((layout) => ({ value: layout, label: t(`layout.${layout}`) }))}
        onChange={(value) => {
          if (isLayout(value)) onChange({ layout: value })
        }}
      />
    </SettingsSection>
  )
}
