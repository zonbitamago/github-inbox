// 設定の画面（component-frontend.md 2.1 の SettingsPage）。開いているかは画面の中だけの状態（App が持つ）。
// 「戻る」か Esc でメインの画面に戻る。
import { useEffect } from 'react'
import { SettingsForm } from '../../features/settings/SettingsForm'
import { useT } from '../../i18n'
import { Button } from '../../ui/Button'
import styles from './SettingsPage.module.css'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const t = useT()

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
        <SettingsForm />
      </div>
    </main>
  )
}
