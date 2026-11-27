// 使い始めの案内の手順3「GitHub の通知設定を確かめる」の中身（component-frontend.md 3.、F-36 (3)）。
// 確かめる項目と、設定ページ（https://github.com/settings/notifications）を開くボタン。開くのはメインが URL を確かめてから（I-8）。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './onboarding.module.css'

const GITHUB_NOTIFICATION_SETTINGS_URL = 'https://github.com/settings/notifications'

export function GitHubSettingsStep({ onOpened }: { onOpened: () => void }) {
  const t = useT()
  const invoke = useInvoke()
  const [openFailed, setOpenFailed] = useState(false)

  const open = async () => {
    setOpenFailed(false)
    try {
      const result = await invoke('shell:openGitHub', { url: GITHUB_NOTIFICATION_SETTINGS_URL })
      if (result.ok) onOpened()
      else setOpenFailed(true)
    } catch {
      setOpenFailed(true)
    }
  }

  return (
    <>
      <p>{t('onboarding.githubSettings.intro')}</p>
      <ul className={styles.list}>
        <li>{t('onboarding.githubSettings.participating')}</li>
        <li>{t('onboarding.githubSettings.actions')}</li>
        <li>{t('onboarding.githubSettings.failedOnly')}</li>
      </ul>
      <div>
        <Button onClick={() => void open()}>{t('onboarding.githubSettings.open')}</Button>
      </div>
      {openFailed ? (
        <p role="alert" className={styles.error}>
          {t('onboarding.githubSettings.openFailed')}
        </p>
      ) : null}
    </>
  )
}
