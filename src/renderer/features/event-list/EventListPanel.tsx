// 出来事の一覧（component-frontend.md 2.2 の event-list）。S1 は殻（並べて出すだけ）。
// 絞り込み・開く・強調は S3・S4 で足す。GitHub から取った文字は文字としてだけ出す（S-05）。
import type { GitHubEvent } from '../../../shared/domain'
import { formatDateTime } from '../../i18n/format'
import { useLanguage, useT } from '../../i18n'
import { Badge } from '../../ui/Badge'
import { EmptyState } from '../../ui/EmptyState'
import styles from './EventListPanel.module.css'

function EventRow({ event }: { event: GitHubEvent }) {
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

export function EventListPanel({ events }: { events: GitHubEvent[] }) {
  const t = useT()
  return (
    <section className={styles.panel} aria-labelledby="event-list-title">
      <h2 id="event-list-title" className={styles.heading}>
        {t('eventList.title')}
      </h2>
      {events.length === 0 ? (
        <EmptyState>{t('eventList.empty')}</EmptyState>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </section>
  )
}
