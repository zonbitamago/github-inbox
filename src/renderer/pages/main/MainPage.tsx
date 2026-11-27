// メインの画面（component-frontend.md 2.1 の MainPage）。上部の知らせ（受け取れていない。S3。デスクトップ通知の失敗。S4）と
// 出来事の一覧。新しい版の帯（S6）、PR の一覧（S5）、並べ方（S6）は各スライスで足す。
// 帯の「サインインし直す」を押したら、画面の中だけの状態で PAT の貼り付けを出す（CR-008。設定を開いているのと同じ扱い）。
// デスクトップ通知がクリックされたら（ui:focusEvent。F-08）、出来事の一覧に戻し、その出来事を強調する（component-frontend.md 5.）。
import { useState } from 'react'
import type { GitHubEvent } from '../../../shared/domain'
import { PatPanel } from '../../features/auth/PatPanel'
import { EventListPanel } from '../../features/event-list/EventListPanel'
import { DesktopNotificationBanner } from '../../features/status/DesktopNotificationBanner'
import { IngestStatusBanner } from '../../features/status/IngestStatusBanner'
import { selectIngestNotice } from '../../features/status/ingest-notice'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import styles from './MainPage.module.css'

export function MainPage({ events }: { events: GitHubEvent[] }) {
  const t = useT()
  const { appState, focusRequest } = useMainSnapshot()
  const [signingInAgain, setSigningInAgain] = useState(false)
  const [seenFocusSeq, setSeenFocusSeq] = useState(focusRequest?.seq ?? null)
  const notice = appState === null ? null : selectIngestNotice(appState)
  const desktopNotification = appState?.desktopNotification

  // デスクトップ通知のクリックが届いたら、サインインし直す画面を開いていても出来事の一覧に戻す
  if (focusRequest !== null && focusRequest.seq !== seenFocusSeq) {
    setSeenFocusSeq(focusRequest.seq)
    setSigningInAgain(false)
  }

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
      {desktopNotification?.failure === undefined ? null : (
        <DesktopNotificationBanner
          failure={desktopNotification.failure}
          failedAt={desktopNotification.failedAt}
        />
      )}
      <EventListPanel events={events} focusRequest={focusRequest} />
    </main>
  )
}
