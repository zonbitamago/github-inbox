// 自動起動（F-25、AC-27）。OS のログイン項目を変え、メインが読み直した値（AppState.loginItem）で出す。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Toggle } from '../../ui/Toggle'
import { SettingsSection } from './SettingsSection'
import styles from './SettingsForm.module.css'

export function LoginItemSection({ enabled }: { enabled: boolean }) {
  const t = useT()
  const invoke = useInvoke()
  const [failed, setFailed] = useState(false)

  const change = async (next: boolean) => {
    setFailed(false)
    try {
      const result = await invoke('loginItem:set', { enabled: next })
      if (!result.ok) setFailed(true)
    } catch {
      setFailed(true)
    }
  }

  return (
    <SettingsSection title={t('settings.loginItem.title')}>
      <Toggle
        label={t('settings.loginItem.label')}
        checked={enabled}
        onChange={(next) => void change(next)}
      />
      {failed ? (
        <p role="alert" className={styles.error}>
          {t('settings.loginItem.failed')}
        </p>
      ) : null}
    </SettingsSection>
  )
}
