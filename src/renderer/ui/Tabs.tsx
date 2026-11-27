// タブ（component-frontend.md 2.3。並べ方がタブのとき、出来事の一覧と PR の一覧を切り替える。F-33）。
// WAI-ARIA のタブの形: 左右の矢印・Home・End で選び直す（選んだらすぐ切り替える）。
// 選んでいないタブの中身も消さずに隠す（絞り込みなど、画面の中だけの状態を切り替えで失わないため）。
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface TabItem<K extends string> {
  key: K
  label: string
  panel: ReactNode
}

export function Tabs<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  actions,
}: {
  /** タブの並び全体の名前（読み上げ用） */
  label: string
  tabs: readonly TabItem<K>[]
  selected: K
  onSelect: (key: K) => void
  /** タブの並びの右端に置くもの（設定を開くボタンなど）。タブの並びの外に置く */
  actions?: ReactNode
}) {
  const id = useId()
  const buttons = useRef(new Map<K, HTMLButtonElement>())

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.key === selected)
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    const target = tabs[next]
    if (target === undefined) return
    onSelect(target.key)
    buttons.current.get(target.key)?.focus()
  }

  return (
    <div className={styles.tabs}>
      <div className={styles.bar}>
        <div role="tablist" aria-label={label} className={styles.list} onKeyDown={move}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              ref={(element) => {
                if (element === null) buttons.current.delete(tab.key)
                else buttons.current.set(tab.key, element)
              }}
              type="button"
              role="tab"
              id={`${id}-${tab.key}-tab`}
              aria-selected={tab.key === selected}
              aria-controls={`${id}-${tab.key}-panel`}
              tabIndex={tab.key === selected ? 0 : -1}
              className={tab.key === selected ? `${styles.tab} ${styles.selected}` : styles.tab}
              onClick={() => onSelect(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${id}-${tab.key}-panel`}
          aria-labelledby={`${id}-${tab.key}-tab`}
          hidden={tab.key !== selected}
          className={styles.panel}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
