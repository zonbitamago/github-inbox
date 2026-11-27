// 画面の配色（F-35、AC-44。CR-012）。選んだ値はメインが OS の外観に上書きし（nativeTheme.themeSource）、
// 画面の配色は prefers-color-scheme で切り替わる。画面はここで選ばせるだけで、配色を切り替える処理を持たない。
import { APPEARANCES, type Appearance } from '../../../shared/domain'
import { useT } from '../../i18n'
import { Select } from '../../ui/Select'
import { SettingsSection } from './SettingsSection'

const isAppearance = (value: string): value is Appearance =>
  APPEARANCES.some((appearance) => appearance === value)

export function AppearanceSection({
  value,
  onChange,
}: {
  value: Appearance
  onChange: (appearance: Appearance) => void
}) {
  const t = useT()
  return (
    <SettingsSection title={t('settings.appearance.title')}>
      <Select
        label={t('settings.appearance.label')}
        value={value}
        options={APPEARANCES.map((appearance) => ({
          value: appearance,
          label: t(`appearance.${appearance}`),
        }))}
        onChange={(next) => {
          if (isAppearance(next)) onChange(next)
        }}
      />
    </SettingsSection>
  )
}
