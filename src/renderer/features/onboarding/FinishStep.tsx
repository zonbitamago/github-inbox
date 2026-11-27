// 使い始めの案内の手順5「終わり」の中身（component-frontend.md 3.）。自動起動のオン／オフ（F-25）を選べ、
// 「使い始める」で onboarding:complete を頼む。自動起動はメインが OS から読み直した値（AppState.loginItem）で出す。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { Toggle } from '../../ui/Toggle'
import { SignedInAs } from './SignedInAs'
import styles from './onboarding.module.css'

export function FinishStep({
  login,
  loginItemEnabled,
  onCompleted,
}: {
  login: string | undefined
  loginItemEnabled: boolean
  /** 終えられたとき（設定から開き直した案内を閉じるため） */
  onCompleted?: (() => void) | undefined
}) {
  const t = useT()
  const invoke = useInvoke()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loginItemFailed, setLoginItemFailed] = useState(false)

  const complete = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await invoke('onboarding:complete')
      if (result.ok) onCompleted?.()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const changeLoginItem = async (enabled: boolean) => {
    setLoginItemFailed(false)
    try {
      const result = await invoke('loginItem:set', { enabled })
      if (!result.ok) setLoginItemFailed(true)
    } catch {
      setLoginItemFailed(true)
    }
  }

  return (
    <>
      <SignedInAs login={login} />
      <Toggle
        label={t('settings.loginItem.label')}
        checked={loginItemEnabled}
        onChange={(enabled) => void changeLoginItem(enabled)}
      />
      {loginItemFailed ? (
        <p role="alert" className={styles.error}>
          {t('settings.loginItem.failed')}
        </p>
      ) : null}
      <div>
        <Button variant="primary" onClick={() => void complete()} disabled={busy}>
          {t('onboarding.finish.start')}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className={styles.error}>
          {t('onboarding.finish.failed')}
        </p>
      ) : null}
    </>
  )
}
