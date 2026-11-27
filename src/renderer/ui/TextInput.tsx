import { useId } from 'react'
import styles from './TextInput.module.css'

/** 名前の付いた1行の入力欄（component-frontend.md 2.3） */
export function TextInput({
  label,
  value,
  onChange,
  secret = false,
  disabled = false,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** 入れた文字を見せない（トークンなど） */
  secret?: boolean
  disabled?: boolean
  maxLength?: number
}) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}
