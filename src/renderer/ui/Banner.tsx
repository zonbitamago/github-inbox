import type { ReactNode } from 'react'
import styles from './Banner.module.css'

/** 帯の色（design-system.md 6.）。失敗は danger、注意は warning、新しい版は primary、そのほかは neutral */
export type BannerTone = 'danger' | 'warning' | 'primary' | 'neutral'

/** 画面の上部の帯（component-frontend.md 2.3）。文字は中身として渡す */
export function Banner({ children, tone }: { children: ReactNode; tone: BannerTone }) {
  return (
    <div role="status" className={`${styles.banner} ${styles[tone]}`}>
      {children}
    </div>
  )
}
