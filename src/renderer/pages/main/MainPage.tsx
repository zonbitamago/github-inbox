// メインの画面（component-frontend.md 2.1 の MainPage）。上部の知らせ（受け取れていない。S3。デスクトップ通知の失敗。S4）と、
// 出来事の一覧と PR の一覧（S5）。2つの一覧はタブで切り替える（並べ方の既定。左右に並べる形と、新しい版の帯は S6 で足す）。
// 帯の「サインインし直す」を押したら、画面の中だけの状態で PAT の貼り付けを出す（CR-008。設定を開いているのと同じ扱い）。
// デスクトップ通知がクリックされたら（ui:focusEvent。F-08）、出来事の一覧のタブに戻し、その出来事を強調する（component-frontend.md 5.）。
import { useState } from 'react'
import type { GitHubEvent } from '../../../shared/domain'
import { PatPanel } from '../../features/auth/PatPanel'
import { EventListPanel } from '../../features/event-list/EventListPanel'
import { PrListPanel } from '../../features/pr-list/PrListPanel'
import { DesktopNotificationBanner } from '../../features/status/DesktopNotificationBanner'
import { IngestStatusBanner } from '../../features/status/IngestStatusBanner'
import { selectIngestNotice } from '../../features/status/ingest-notice'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { Tabs } from '../../ui/Tabs'
import styles from './MainPage.module.css'

type MainTab = 'events' | 'prs'

/** まだ状態が届いていないとき（App が出さないので、型のためだけ） */
const PR_LIST_IDLE = { loading: false }

export function MainPage({ events }: { events: GitHubEvent[] }) {
  const t = useT()
  const { appState, prList, focusRequest } = useMainSnapshot()
  const [signingInAgain, setSigningInAgain] = useState(false)
  const [tab, setTab] = useState<MainTab>('events')
  const [seenFocusSeq, setSeenFocusSeq] = useState(focusRequest?.seq ?? null)
  const notice = appState === null ? null : selectIngestNotice(appState)
  const desktopNotification = appState?.desktopNotification

  // デスクトップ通知のクリックが届いたら、サインインし直す画面や PR の一覧を開いていても出来事の一覧に戻す
  if (focusRequest !== null && focusRequest.seq !== seenFocusSeq) {
    setSeenFocusSeq(focusRequest.seq)
    setSigningInAgain(false)
    setTab('events')
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
      <Tabs
        label={t('mainPage.tabs.label')}
        selected={tab}
        onSelect={setTab}
        tabs={[
          {
            key: 'events',
            label: t('eventList.title'),
            panel: <EventListPanel events={events} focusRequest={focusRequest} />,
          },
          {
            key: 'prs',
            label: t('prList.title'),
            panel: <PrListPanel prList={prList} status={appState?.prList ?? PR_LIST_IDLE} />,
          },
        ]}
      />
    </main>
  )
}
