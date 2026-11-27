// 設定の画面（component-frontend.md 2.1 の SettingsPage）。開いているかは画面の中だけの状態（App が持つ）。
// 「戻る」か Esc でメインの画面に戻る。「デスクトップ通知が出ないとき」には試しのデスクトップ通知（features/status）を組む（D-033）。
import { useEffect } from 'react'
import { SettingsForm } from '../../features/settings/SettingsForm'
import { DesktopNotificationCheck } from '../../features/status/DesktopNotificationCheck'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './SettingsPage.module.css'

export function SettingsPage({
  onClose,
  onRestartOnboarding,
}: {
  onClose: () => void
  onRestartOnboarding: () => void
}) {
  const t = useT()
  const appInfo = useMainSnapshot().appState?.appInfo

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('settings.title')}</h1>
        <Button onClick={onClose}>{t('settings.back')}</Button>
      </header>
      <div className={styles.body}>
        <SettingsForm
          onRestartOnboarding={onRestartOnboarding}
          desktopNotificationHelp={
            appInfo === undefined ? null : (
              <DesktopNotificationCheck
                platform={appInfo.platform}
                inApplicationsFolder={appInfo.inApplicationsFolder}
              />
            )
          }
        />
      </div>
    </main>
  )
}
