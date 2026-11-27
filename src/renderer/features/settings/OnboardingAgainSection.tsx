// 使い始めの案内をもう一度（component-frontend.md 2.1 の SettingsPage・3.）。案内を開き直すかは画面の中だけの状態（App が持つ）。
import { useT } from '../../i18n'
import { Button } from '../../ui/Button'
import { SettingsSection } from './SettingsSection'
import styles from './SettingsForm.module.css'

export function OnboardingAgainSection({ onRestart }: { onRestart: () => void }) {
  const t = useT()
  return (
    <SettingsSection title={t('settings.onboarding.title')}>
      <p className={styles.text}>{t('settings.onboarding.description')}</p>
      <div>
        <Button onClick={onRestart}>{t('settings.onboarding.restart')}</Button>
      </div>
    </SettingsSection>
  )
}
