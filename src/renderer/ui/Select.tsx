import { useId } from 'react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

/** 名前の付いた選択欄（component-frontend.md 2.3） */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
