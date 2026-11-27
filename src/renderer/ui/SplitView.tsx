import type { ReactNode } from 'react'
import styles from './SplitView.module.css'

/** 左右に並べる（component-frontend.md 2.3。並べ方が「左右に並べる」のとき。F-33）。それぞれの中で縦に流れる */
export function SplitView({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.pane}>{left}</div>
      <div className={styles.pane}>{right}</div>
    </div>
  )
}
