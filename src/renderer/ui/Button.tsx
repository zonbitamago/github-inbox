import type { ReactNode } from 'react'
import styles from './Button.module.css'

/**
 * ボタン（component-frontend.md 2.3）。文字だけで、アイコンは使わない（design-system.md 6.）。
 * primary は主な操作（1つの画面に1つ）、secondary はそれ以外。送信は form の onSubmit で受ける
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  submit = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  submit?: boolean
}) {
  const className = variant === 'primary' ? styles.primary : styles.secondary
  return submit ? (
    <button type="submit" className={className} disabled={disabled}>
      {children}
    </button>
  ) : (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
