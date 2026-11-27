// OS の通知の設定を開くボタン（N-09、AC-38）。開く先はメインが OS ごとに決める（ipc-contract.md 2.）。
// デスクトップ通知の失敗の帯と、試しのデスクトップ通知（使い始めの案内の手順4・設定の画面）で使う。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './status.module.css'

export function OpenDesktopNotificationSettingsButton() {
  const t = useT()
  const invoke = useInvoke()
  const [failed, setFailed] = useState(false)

  const open = async () => {
    setFailed(false)
    try {
      const result = await invoke('os:openNotificationSettings')
      if (!result.ok) setFailed(true)
    } catch {
      setFailed(true)
    }
  }

  return (
    <>
      <Button onClick={() => void open()}>{t('desktopNotificationFailure.openSettings')}</Button>
      {failed ? (
        <span role="alert" className={styles.error}>
          {t('desktopNotificationFailure.openSettingsFailed')}
        </span>
      ) : null}
    </>
  )
}
