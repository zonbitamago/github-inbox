// デスクトップ通知を出せなかったことの知らせ（component-frontend.md 2.2 の DesktopNotificationBanner、N-09、AC-38、Q-07）。
// 理由と直し方を出す。OS が断ったときは OS の通知の設定を開ける（開く先はメインが決める。ipc-contract.md 2.）。
// アプリケーションフォルダへ移す操作は、使い始めの案内の手順1と合わせて S6 で足す。それまでは文言で移すよう伝える。
// 次にデスクトップ通知を出せたら、メインの状態が変わって消える（component-backend.md 5.4）。
import { useState } from 'react'
import type { DesktopNotificationFailure } from '../../../shared/domain'
import type { MessageKey } from '../../i18n'
import { useLanguage, useT } from '../../i18n'
import { formatDateTime } from '../../i18n/format'
import { useInvoke } from '../../main-store/use-main-store'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import styles from './DesktopNotificationBanner.module.css'

const MESSAGES: Record<DesktopNotificationFailure, MessageKey> = {
  os_rejected: 'desktopNotificationFailure.osRejected',
  outside_applications_folder: 'desktopNotificationFailure.outsideApplicationsFolder',
}

/** design-system.md 6.: デスクトップ通知の失敗は warning */
export function DesktopNotificationBanner({
  failure,
  failedAt,
}: {
  failure: DesktopNotificationFailure
  failedAt?: string | undefined
}) {
  const t = useT()
  const language = useLanguage()
  const invoke = useInvoke()
  const [openFailed, setOpenFailed] = useState(false)

  const openSettings = async () => {
    setOpenFailed(false)
    try {
      const result = await invoke('os:openNotificationSettings')
      if (!result.ok) setOpenFailed(true)
    } catch {
      setOpenFailed(true)
    }
  }

  return (
    <Banner tone="warning">
      <span>{t(MESSAGES[failure])}</span>
      {failedAt === undefined ? null : (
        <span className={styles.time}>
          <span>{t('desktopNotificationFailure.failedAt')}</span>
          <time dateTime={failedAt}>{formatDateTime(failedAt, language)}</time>
        </span>
      )}
      {failure === 'os_rejected' ? (
        <Button onClick={() => void openSettings()}>
          {t('desktopNotificationFailure.openSettings')}
        </Button>
      ) : null}
      {openFailed ? (
        <span role="alert" className={styles.error}>
          {t('desktopNotificationFailure.openSettingsFailed')}
        </span>
      ) : null}
    </Banner>
  )
}
