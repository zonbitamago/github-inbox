// アプリケーションフォルダへ移すボタン（F-36 (1)、AC-41）。使い始めの案内の手順1・デスクトップ通知の失敗の帯・試しのデスクトップ通知で使う。
// 移せたらアプリは移した先で開き直すため、成功しても画面では何もしない。移せなければ、手で移す方法を出す。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './status.module.css'

export function MoveToApplicationsFolderButton({
  variant = 'secondary',
}: {
  variant?: 'primary' | 'secondary'
}) {
  const t = useT()
  const invoke = useInvoke()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const move = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await invoke('onboarding:moveToApplicationsFolder')
      if (!result.ok) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => void move()} disabled={busy}>
        {t('applicationsFolder.move')}
      </Button>
      {failed ? (
        <span role="alert" className={styles.error}>
          {t('applicationsFolder.moveFailed')}
        </span>
      ) : null}
    </>
  )
}
