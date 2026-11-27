// 新しい版の知らせ（component-frontend.md 2.2 の UpdateBanner、F-31、AC-31）。
// Releases のページはメインが URL の検査を通して開く（shell:openGitHub。I-8）。入れ直しは各自（D-012）。
import { useState } from 'react'
import { fillMessage, useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import styles from './status.module.css'

/** design-system.md 6.: 新しい版は primary の地と文字 */
export function UpdateBanner({ update }: { update: { version: string; url: string } }) {
  const t = useT()
  const invoke = useInvoke()
  const [openFailed, setOpenFailed] = useState(false)

  const open = async () => {
    setOpenFailed(false)
    try {
      const result = await invoke('shell:openGitHub', { url: update.url })
      if (!result.ok) setOpenFailed(true)
    } catch {
      setOpenFailed(true)
    }
  }

  return (
    <Banner tone="primary">
      <span>{fillMessage(t('update.available'), { version: update.version })}</span>
      <Button onClick={() => void open()}>{t('update.open')}</Button>
      {openFailed ? (
        <span role="alert" className={styles.error}>
          {t('update.openFailed')}
        </span>
      ) : null}
    </Banner>
  )
}
