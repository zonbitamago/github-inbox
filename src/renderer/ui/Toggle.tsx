import { useId } from 'react'
import styles from './Toggle.module.css'

/** オン／オフの切り替え（component-frontend.md 2.3）。チェックボックスを switch として読ませる */
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={styles.field}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
    </div>
  )
}
