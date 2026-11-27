// 探した語に当たる所を強調して出す（D-032。出来事の一覧と PR の一覧）。GitHub から取った文字は文字としてだけ出す（S-05）。
import { highlightParts } from './highlight'
import styles from './HighlightedText.module.css'

export function HighlightedText({ text, words }: { text: string; words: readonly string[] }) {
  return highlightParts(text, words).map((part, index) =>
    part.highlighted ? (
      // 並びが変わらない分け方なので、位置を key にしてよい
      <mark key={index} className={styles.mark}>
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  )
}
