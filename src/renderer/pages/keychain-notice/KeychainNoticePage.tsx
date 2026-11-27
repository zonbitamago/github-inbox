// キーチェーンの案内（component-frontend.md 2.1 の KeychainNoticePage、F-36 (5)、auth-flow.md 4.）。
// 版を上げた後、トークンを読み出す前に出す。案内するボタンは要件の文言（「許可」）。「常に許可」とどちらにするかは S7 で確かめる（DR-06）。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './KeychainNoticePage.module.css'

export function KeychainNoticePage() {
  const t = useT()
  const invoke = useInvoke()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const proceed = async () => {
    setBusy(true)
    setFailed(false)
    try {
      // ここでキーチェーンの確認が出る。読み出せたかどうかは state:changed で画面が切り替わる
      const result = await invoke('auth:continueAfterKeychainNotice')
      if (!result.ok) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('keychainNotice.title')}</h1>
      <p>{t('keychainNotice.body')}</p>
      <div>
        <Button variant="primary" onClick={() => void proceed()} disabled={busy}>
          {t('keychainNotice.continue')}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className={styles.error}>
          {t('keychainNotice.failed')}
        </p>
      ) : null}
    </main>
  )
}
