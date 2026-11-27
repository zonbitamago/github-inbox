import type { ReactNode } from 'react'
import styles from './Badge.module.css'

/** ラベルの色の組（design-system.md 2.2）。地と文字の組を崩さない */
export type BadgeTone = 'neutral' | 'primary' | 'danger' | 'success'

/** ラベル（design-system.md 2.2）。色は意味のあるところだけに使う（1.） */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
