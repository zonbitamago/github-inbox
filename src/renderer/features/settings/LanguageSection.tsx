// 表示言語（F-26、AC-28）。言語の名前は、どちらの言語で出していてもその言語の名前で出す。
import { LANGUAGES, type Language } from '../../../shared/domain'
import { useT } from '../../i18n'
import { Select } from '../../ui/Select'
import { SettingsSection } from './SettingsSection'

const isLanguage = (value: string): value is Language =>
  LANGUAGES.some((language) => language === value)

export function LanguageSection({
  value,
  onChange,
}: {
  value: Language
  onChange: (language: Language) => void
}) {
  const t = useT()
  return (
    <SettingsSection title={t('settings.language.title')}>
      <Select
        label={t('settings.language.label')}
        value={value}
        options={LANGUAGES.map((language) => ({
          value: language,
          label: t(`language.${language}`),
        }))}
        onChange={(next) => {
          if (isLanguage(next)) onChange(next)
        }}
      />
    </SettingsSection>
  )
}
