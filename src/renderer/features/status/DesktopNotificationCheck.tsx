// 試しのデスクトップ通知（component-frontend.md 3. の手順4、設定の画面の「デスクトップ通知が出ないとき」。F-36 (4)、N-09、AC-38）。
// 1件出し、結果が failed なら直し方を出す。unknown なら「表示された／表示されなかった」を聞く。
// Mac では shown でも聞く（OS の設定でオフでも shown になるため。D-033）。「表示されなかった」なら直し方を出す。
// 直し方は、Mac でアプリケーションフォルダの外なら移すボタン、それ以外は OS の通知の設定を開くボタン（帯と同じ分け方）。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { MoveToApplicationsFolderButton } from './MoveToApplicationsFolderButton'
import { OpenDesktopNotificationSettingsButton } from './OpenDesktopNotificationSettingsButton'
import styles from './DesktopNotificationCheck.module.css'

type Phase = 'idle' | 'sending' | 'asking' | 'confirmed' | 'not_shown' | 'failed'

export function DesktopNotificationCheck({
  platform,
  inApplicationsFolder,
  onConfirmed,
}: {
  platform: 'darwin' | 'win32'
  /** Mac 以外は null */
  inApplicationsFolder: boolean | null
  /** 表示されたと分かったとき */
  onConfirmed?: () => void
}) {
  const t = useT()
  const invoke = useInvoke()
  const [phase, setPhase] = useState<Phase>('idle')
  const [sendFailed, setSendFailed] = useState(false)

  const confirm = () => {
    setPhase('confirmed')
    onConfirmed?.()
  }

  const send = async () => {
    setPhase('sending')
    setSendFailed(false)
    try {
      const result = await invoke('onboarding:sendTestNotification')
      if (!result.ok) {
        setPhase('idle')
        setSendFailed(true)
        return
      }
      const { outcome } = result.value
      if (outcome === 'failed') setPhase('failed')
      else if (outcome === 'shown' && platform !== 'darwin') confirm()
      else setPhase('asking')
    } catch {
      setPhase('idle')
      setSendFailed(true)
    }
  }

  const outsideApplicationsFolder = inApplicationsFolder === false

  return (
    <div className={styles.check}>
      <div className={styles.row}>
        <Button onClick={() => void send()} disabled={phase === 'sending'}>
          {phase === 'idle' || phase === 'sending'
            ? t('desktopNotificationCheck.send')
            : t('desktopNotificationCheck.sendAgain')}
        </Button>
        {phase === 'sending' ? (
          <span role="status" className={styles.mute}>
            {t('desktopNotificationCheck.sending')}
          </span>
        ) : null}
      </div>
      {sendFailed ? (
        <p role="alert" className={styles.error}>
          {t('desktopNotificationCheck.sendFailed')}
        </p>
      ) : null}
      {phase === 'asking' ? (
        <div className={styles.question}>
          <p className={styles.text}>{t('desktopNotificationCheck.question')}</p>
          <div className={styles.row}>
            <Button onClick={confirm}>{t('desktopNotificationCheck.shown')}</Button>
            <Button onClick={() => setPhase('not_shown')}>
              {t('desktopNotificationCheck.notShown')}
            </Button>
          </div>
        </div>
      ) : null}
      {phase === 'confirmed' ? (
        <p role="status" className={styles.text}>
          {t('desktopNotificationCheck.confirmed')}
        </p>
      ) : null}
      {phase === 'failed' || phase === 'not_shown' ? (
        <div className={styles.fix}>
          <p className={styles.text}>
            {outsideApplicationsFolder
              ? t('desktopNotificationCheck.fix.applicationsFolder')
              : t('desktopNotificationCheck.fix.osSettings')}
          </p>
          <div className={styles.row}>
            {outsideApplicationsFolder ? (
              <MoveToApplicationsFolderButton />
            ) : (
              <OpenDesktopNotificationSettingsButton />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
