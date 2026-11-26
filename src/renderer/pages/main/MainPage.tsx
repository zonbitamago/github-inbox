// メインの画面（component-frontend.md 2.1 の MainPage）。S1 は出来事の一覧の殻だけ。
// 上部の知らせ（S3・S4）、PR の一覧（S5）、並べ方（S6）は各スライスで足す。
import type { GitHubEvent } from '../../../shared/domain'
import { EventListPanel } from '../../features/event-list/EventListPanel'
import styles from './MainPage.module.css'

export function MainPage({ events }: { events: GitHubEvent[] }) {
  return (
    <main className={styles.page}>
      <EventListPanel events={events} />
    </main>
  )
}
