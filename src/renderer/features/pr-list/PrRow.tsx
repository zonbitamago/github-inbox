// PR の一覧の1行（component-frontend.md 2.2 の PrRow。F-14・F-15）。
// 状態・自分待ちの理由のラベル・タイトル・リポジトリと番号・作成者（bot の印）・更新。押すと GitHub の PR のページを開く（F-17）。
// GitHub から取った文字は文字としてだけ出す（S-05）。文字で探した語は、探す対象の文字の中で強調する（D-032）。
import type { PullRequestItem } from '../../../shared/domain'
import { useLanguage, useT } from '../../i18n'
import { formatDateTime, formatRelativeTime } from '../../i18n/format'
import { Badge } from '../../ui/Badge'
import { HighlightedText } from '../../ui/HighlightedText'
import { repositoryLabel } from './filter-prs'
import { waitingReasonTone } from './reason-badge'
import styles from './PrRow.module.css'

export function PrRow({
  item,
  words,
  now,
  onOpen,
}: {
  item: PullRequestItem
  /** 文字で探した語（強調する） */
  words: readonly string[]
  now: Date
  onOpen: (item: PullRequestItem) => void
}) {
  const t = useT()
  const language = useLanguage()
  return (
    <li>
      <button type="button" className={styles.row} onClick={() => onOpen(item)}>
        <span className={styles.head}>
          <Badge>{t(`prState.${item.state}`)}</Badge>
          {/* 理由は表示の順（business-data.md 2.5）でメインから届く */}
          {item.waitingReasons.map((reason) => (
            <Badge key={reason} tone={waitingReasonTone(reason)}>
              {t(`waitingReason.${reason}`)}
            </Badge>
          ))}
          <span className={styles.title}>
            <HighlightedText text={item.title} words={words} />
          </span>
        </span>
        <span className={styles.meta}>
          <span>
            <HighlightedText text={repositoryLabel(item)} words={words} />
          </span>
          <span className={styles.author}>
            <span>
              <HighlightedText text={item.author.login} words={words} />
            </span>
            {item.author.isBot && <Badge>{t('common.bot')}</Badge>}
          </span>
          <time dateTime={item.updatedAt} title={formatDateTime(item.updatedAt, language)}>
            {formatRelativeTime(item.updatedAt, now, language)}
          </time>
        </span>
      </button>
    </li>
  )
}
