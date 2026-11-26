import type { ReactNode } from 'react'
import styles from './Badge.module.css'

/** ラベル（design-system.md 2.2）。色は意味のあるところだけに使う（1.）。今は neutral だけ */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>
}
