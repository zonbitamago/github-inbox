// メインの画面（component-frontend.md 2.1 の MainPage）。上部の知らせ（受け取れていない。S3。デスクトップ通知の失敗。S4）と、
// 出来事の一覧と PR の一覧（S5）。並べ方は設定に従い、タブで切り替えるか左右に並べる（F-33。S6a）。新しい版の帯（F-31。S6b）。
// 帯の「サインインし直す」を押したら、画面の中だけの状態で PAT の貼り付けを出す（CR-008。設定を開いているのと同じ扱い）。
// デスクトップ通知がクリックされたら（ui:focusEvent。F-08）、出来事の一覧のタブに戻し、その出来事を強調する（component-frontend.md 5.）。
// キーボード: Cmd+R（Windows は Ctrl+R）で PR の一覧をリロード、Cmd+F で今の一覧の検索欄へ、Cmd+, で設定（component-frontend.md 5.）。
import { useEffect, useRef, useState } from 'react'
import type { GitHubEvent } from '../../../shared/domain'
import { PatPanel } from '../../features/auth/PatPanel'
import { EventListPanel } from '../../features/event-list/EventListPanel'
import { PrListPanel } from '../../features/pr-list/PrListPanel'
import { DesktopNotificationBanner } from '../../features/status/DesktopNotificationBanner'
import { IngestStatusBanner } from '../../features/status/IngestStatusBanner'
import { UpdateBanner } from '../../features/status/UpdateBanner'
import { selectIngestNotice } from '../../features/status/ingest-notice'
import { useT } from '../../i18n'
import { useInvoke, useMainSnapshot } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { SplitView } from '../../ui/SplitView'
import { Tabs } from '../../ui/Tabs'
import { shortcutOf } from './shortcuts'
import styles from './MainPage.module.css'

type MainTab = 'events' | 'prs'

/** まだ状態が届いていないとき（App が出さないので、型のためだけ） */
const PR_LIST_IDLE = { loading: false }

/** 一覧の中の、文字で探す欄 */
const SEARCH_INPUT = '[role="search"] input'

export function MainPage({
  events,
  onOpenSettings,
}: {
  events: GitHubEvent[]
  onOpenSettings: () => void
}) {
  const t = useT()
  const invoke = useInvoke()
  const { appState, prList, focusRequest } = useMainSnapshot()
  const [signingInAgain, setSigningInAgain] = useState(false)
  const [tab, setTab] = useState<MainTab>('events')
  const [seenFocusSeq, setSeenFocusSeq] = useState(focusRequest?.seq ?? null)
  const eventsRef = useRef<HTMLDivElement>(null)
  const prsRef = useRef<HTMLDivElement>(null)
  const notice = appState === null ? null : selectIngestNotice(appState)
  const desktopNotification = appState?.desktopNotification
  const layout = appState?.settings.layout ?? 'tabs'
  const platform = appState?.appInfo.platform ?? 'darwin'

  // デスクトップ通知のクリックが届いたら、サインインし直す画面や PR の一覧を開いていても出来事の一覧に戻す
  if (focusRequest !== null && focusRequest.seq !== seenFocusSeq) {
    setSeenFocusSeq(focusRequest.seq)
    setSigningInAgain(false)
    setTab('events')
  }

  useEffect(() => {
    if (signingInAgain) return undefined
    /** 今の一覧の検索欄へ。左右に並べているときは、キーボードの位置がある方（無ければ出来事の一覧） */
    const focusSearch = () => {
      const prsActive =
        layout === 'side_by_side'
          ? prsRef.current?.contains(document.activeElement) === true
          : tab === 'prs'
      const target = prsActive ? prsRef.current : eventsRef.current
      target?.querySelector<HTMLInputElement>(SEARCH_INPUT)?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutOf(event, platform)
      if (shortcut === undefined) return
      event.preventDefault()
      switch (shortcut) {
        case 'reload':
          // 取れなかったときの理由は AppState.prList で PR の一覧に出る
          invoke('prs:reload').catch(() => undefined)
          return
        case 'search':
          focusSearch()
          return
        case 'settings':
          onOpenSettings()
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [signingInAgain, layout, tab, platform, invoke, onOpenSettings])

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

  const eventsPanel = (
    <div ref={eventsRef} className={styles.slot}>
      <EventListPanel events={events} focusRequest={focusRequest} />
    </div>
  )
  const prsPanel = (
    <div ref={prsRef} className={styles.slot}>
      <PrListPanel prList={prList} status={appState?.prList ?? PR_LIST_IDLE} />
    </div>
  )
  const settingsButton = <Button onClick={onOpenSettings}>{t('mainPage.openSettings')}</Button>

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
      {appState?.update === undefined ? null : <UpdateBanner update={appState.update} />}
      {layout === 'side_by_side' ? (
        <>
          <div className={styles.toolbar}>{settingsButton}</div>
          <SplitView left={eventsPanel} right={prsPanel} />
        </>
      ) : (
        <Tabs
          label={t('mainPage.tabs.label')}
          selected={tab}
          onSelect={setTab}
          actions={settingsButton}
          tabs={[
            { key: 'events', label: t('eventList.title'), panel: eventsPanel },
            { key: 'prs', label: t('prList.title'), panel: prsPanel },
          ]}
        />
      )}
    </main>
  )
}
