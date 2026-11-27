// 設定（component-frontend.md 2.1 の SettingsPage の中身、2.2 の settings）。
// 変えたらすぐ settings:update で頼み、保存ボタンは置かない（component-frontend.md 4.）。出すのはメインから届いた値。
// 「デスクトップ通知が出ないとき」と「使い始めの案内をもう一度」は S6b で足す。
import { useState } from 'react'
import type { SettingsPatch } from '../../../shared/ipc-contract'
import { useT } from '../../i18n'
import { useInvoke, useMainSnapshot } from '../../main-store/use-main-store'
import { AccountSection } from './AccountSection'
import { DesktopNotificationSection } from './DesktopNotificationSection'
import { LanguageSection } from './LanguageSection'
import { ListsSection } from './ListsSection'
import { LoginItemSection } from './LoginItemSection'
import styles from './SettingsForm.module.css'

export function SettingsForm() {
  const t = useT()
  const invoke = useInvoke()
  const { appState } = useMainSnapshot()
  const [saveFailed, setSaveFailed] = useState(false)
  if (appState === null) return null
  const { settings } = appState

  const save = async (patch: SettingsPatch) => {
    setSaveFailed(false)
    try {
      const result = await invoke('settings:update', patch)
      if (!result.ok) setSaveFailed(true)
    } catch {
      setSaveFailed(true)
    }
  }

  return (
    <div className={styles.form}>
      {saveFailed ? (
        <p role="alert" className={styles.error}>
          {t('settings.saveFailed')}
        </p>
      ) : null}
      <DesktopNotificationSection
        value={settings.desktopNotification}
        onChange={(desktopNotification) => void save({ desktopNotification })}
      />
      <ListsSection settings={settings} onChange={(patch) => void save(patch)} />
      <LanguageSection value={settings.language} onChange={(language) => void save({ language })} />
      <LoginItemSection enabled={appState.loginItem.enabled} />
      <AccountSection login={appState.auth.login} />
    </div>
  )
}
