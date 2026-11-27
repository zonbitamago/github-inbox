import type { ReactNode } from 'react'
import styles from './SettingsSection.module.css'

/** 設定の画面の1つの節（見出しと中身） */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
