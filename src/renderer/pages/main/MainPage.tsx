// メインの画面（component-frontend.md 2.1 の MainPage）。上部の知らせ（受け取れていない。S3）と出来事の一覧。
// デスクトップ通知の失敗・新しい版の帯（S4・S6）、PR の一覧（S5）、並べ方（S6）は各スライスで足す。
// 帯の「サインインし直す」を押したら、画面の中だけの状態で PAT の貼り付けを出す（CR-008。設定を開いているのと同じ扱い）。
import { useState } from 'react'
import type { GitHubEvent } from '../../../shared/domain'
import { PatPanel } from '../../features/auth/PatPanel'
import { EventListPanel } from '../../features/event-list/EventListPanel'
import { IngestStatusBanner } from '../../features/status/IngestStatusBanner'
import { selectIngestNotice } from '../../features/status/ingest-notice'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './MainPage.module.css'

export function MainPage({ events }: { events: GitHubEvent[] }) {
  const t = useT()
  const { appState } = useMainSnapshot()
  const [signingInAgain, setSigningInAgain] = useState(false)
  const notice = appState === null ? null : selectIngestNotice(appState)

  if (signingInAgain) {
    return (
      <main className={styles.signIn}>
        <PatPanel title="auth.signIn.again" onSignedIn={() => setSigningInAgain(false)} />
        <div>
          <Button onClick={() => setSigningInAgain(false)}>{t('auth.signIn.back')}</Button>
        </div>
      </main>
    )
  }
  return (
    <main className={styles.page}>
      {notice === null ? null : (
        <IngestStatusBanner notice={notice} onSignInAgain={() => setSigningInAgain(true)} />
      )}
      <EventListPanel events={events} />
    </main>
  )
}
