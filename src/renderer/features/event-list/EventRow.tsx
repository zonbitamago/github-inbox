// 出来事の一覧の1行（component-frontend.md 2.2 の EventRow。F-11）。
// 種類・レビューの結果か CI の結果・対象・リポジトリ・誰が（bot の印）・いつ・抜粋。押すと GitHub の該当ページを開く（F-12）。
// GitHub から取った文字は文字としてだけ出す（S-05）。CI の結果は訳さず GitHub の値のまま（business-data.md 2.3）。
// 文字で探した語は、探す対象の文字（タイトル・リポジトリと番号・誰が・抜粋・CI の結果）の中で強調する（D-032）。
import type { GitHubEvent } from '../../../shared/domain'
import { formatDateTime, formatRelativeTime } from '../../i18n/format'
import { useLanguage, useT } from '../../i18n'
import { Badge } from '../../ui/Badge'
import { repositoryLabel } from './filter-events'
import { HighlightedText } from './HighlightedText'
import { ciConclusionTone, reviewResultTone } from './result-badge'
import styles from './EventRow.module.css'

export function EventRow({
  event,
  words,
  now,
  onOpen,
}: {
  event: GitHubEvent
  /** 文字で探した語（強調する） */
  words: readonly string[]
  now: Date
  onOpen: (event: GitHubEvent) => void
}) {
  const t = useT()
  const language = useLanguage()
  return (
    <li>
      <button type="button" className={styles.row} onClick={() => onOpen(event)}>
        <span className={styles.head}>
          <Badge>{t(`eventType.${event.type}`)}</Badge>
          {event.reviewResult === undefined ? null : (
            <Badge tone={reviewResultTone(event.reviewResult)}>
              {t(`reviewResult.${event.reviewResult}`)}
            </Badge>
          )}
          {event.ciConclusion === undefined ? null : (
            <Badge tone={ciConclusionTone(event.ciConclusion)}>
              <HighlightedText text={event.ciConclusion} words={words} />
            </Badge>
          )}
          {event.viaTeam === true ? <Badge>{t('eventList.viaTeam')}</Badge> : null}
          <span className={styles.title}>
            <HighlightedText text={event.target.title} words={words} />
          </span>
        </span>
        <span className={styles.meta}>
          <span>
            <HighlightedText text={repositoryLabel(event)} words={words} />
          </span>
          <span className={styles.actor}>
            <span>
              <HighlightedText text={event.actor.login} words={words} />
            </span>
            {event.actor.isBot && <Badge>{t('common.bot')}</Badge>}
          </span>
          <time dateTime={event.occurredAt} title={formatDateTime(event.occurredAt, language)}>
            {formatRelativeTime(event.occurredAt, now, language)}
          </time>
        </span>
        {event.excerpt === undefined ? null : (
          // 改行は空白にして1行で出す（Markdown は HTML にしない。component-frontend.md 6.）
          <span className={styles.excerpt}>
            <HighlightedText text={event.excerpt.replace(/\s+/g, ' ')} words={words} />
          </span>
        )}
      </button>
    </li>
  )
}
