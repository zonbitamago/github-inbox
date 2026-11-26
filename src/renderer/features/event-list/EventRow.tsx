// 出来事の一覧の1行（component-frontend.md 2.2 の EventRow）。S1 は種類・対象・リポジトリ・誰が・いつだけ。
// GitHub から取った文字は文字としてだけ出す（S-05）。
import type { GitHubEvent } from '../../../shared/domain'
import { formatDateTime } from '../../i18n/format'
import { useLanguage, useT } from '../../i18n'
import { Badge } from '../../ui/Badge'
import styles from './EventRow.module.css'

export function EventRow({ event }: { event: GitHubEvent }) {
  const t = useT()
  const language = useLanguage()
  const number = event.target.number === undefined ? '' : ` #${event.target.number}`
  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <Badge>{t(`eventType.${event.type}`)}</Badge>
        <span className={styles.title}>{event.target.title}</span>
      </div>
      <div className={styles.meta}>
        <span>{`${event.target.repository}${number}`}</span>
        <span className={styles.actor}>
          <span>{event.actor.login}</span>
          {event.actor.isBot && <Badge>{t('common.bot')}</Badge>}
        </span>
        <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt, language)}</time>
      </div>
    </li>
  )
}
