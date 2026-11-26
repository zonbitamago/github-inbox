// 出来事の一覧（component-frontend.md 2.2 の event-list）。S1 は殻（並べて出すだけ）。
// 絞り込み・開く・強調は S3・S4 で足す。
import type { GitHubEvent } from '../../../shared/domain'
import { useT } from '../../i18n'
import { EmptyState } from '../../ui/EmptyState'
import { EventRow } from './EventRow'
import styles from './EventListPanel.module.css'

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
