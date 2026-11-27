// 使い始めの案内の手順5「終わり」（component-frontend.md 3.）。「使い始める」で onboarding:complete を頼む。
// 自動起動の切り替え（F-25）は S6 で足す。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './FinishStep.module.css'

export function FinishStep({ login }: { login: string | undefined }) {
  const t = useT()
  const invoke = useInvoke()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const complete = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await invoke('onboarding:complete')
      if (!result.ok) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.step}>
      <h2 className={styles.title}>{t('onboarding.finish.title')}</h2>
      {login === undefined ? null : (
        <p>
          {t('onboarding.finish.signedInAs')}
          {/* GitHub から取った文字は文字としてだけ出す（security-rules.md S-05） */}
          <strong className={styles.login}>{login}</strong>
        </p>
      )}
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
    </section>
  )
}
