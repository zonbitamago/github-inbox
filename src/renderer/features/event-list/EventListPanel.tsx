// 出来事の一覧（component-frontend.md 2.2 の event-list。F-11〜F-13）。
// 絞り込みは画面の中だけの状態で、保存しない（component-frontend.md 4.）。開くのはメインに頼む（URL はメインが確かめる。I-8）。
// デスクトップ通知がクリックされたら（ui:focusEvent。F-08）、その行を強調してキーボードの位置を移す（component-frontend.md 5.）。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubEvent } from '../../../shared/domain'
import { useT } from '../../i18n'
import type { FocusRequest } from '../../main-store/main-store'
import { useInvoke } from '../../main-store/use-main-store'
import { EmptyState } from '../../ui/EmptyState'
import { EventFilterBar } from './EventFilterBar'
import { EventRow } from './EventRow'
import {
  NO_FILTER,
  filterEvents,
  repositoriesOf,
  searchWords,
  type EventFilter,
} from './filter-events'
import { useNow } from './use-now'
import styles from './EventListPanel.module.css'

/** 「5分前」の表し方を進める間隔 */
const CLOCK_TICK_MS = 60 * 1000

export function EventListPanel({
  events,
  focusRequest = null,
}: {
  events: GitHubEvent[]
  /** デスクトップ通知のクリックで強調する出来事（届くたびに seq が変わる） */
  focusRequest?: FocusRequest | null
}) {
  const t = useT()
  const invoke = useInvoke()
  const now = useNow(CLOCK_TICK_MS)
  const [filter, setFilter] = useState<EventFilter>(NO_FILTER)
  const [openFailed, setOpenFailed] = useState(false)
  // 強調する出来事。次のクリックまで残す（AI案）
  const [emphasis, setEmphasis] = useState<FocusRequest | null>(null)
  const [handledSeq, setHandledSeq] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 届いた頼みは1回だけ受ける。一覧に無い出来事なら何もしない。絞り込みで隠れていれば絞り込みを解く
  if (focusRequest !== null && focusRequest.seq !== handledSeq) {
    setHandledSeq(focusRequest.seq)
    const isTarget = (event: GitHubEvent) => event.id === focusRequest.eventId
    if (events.some(isTarget)) {
      setEmphasis(focusRequest)
      if (!filterEvents(events, filter).some(isTarget)) setFilter(NO_FILTER)
    }
  }

  // 強調した行にキーボードの位置を移す（見えるところまでスクロールする）。頼みごとに1回だけ
  useEffect(() => {
    if (emphasis === null) return
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-event-id]') ?? []
    for (const row of rows) {
      if (row.dataset['eventId'] === emphasis.eventId) row.focus()
    }
  }, [emphasis])

  const visible = useMemo(() => filterEvents(events, filter), [events, filter])
  const repositories = useMemo(() => repositoriesOf(events), [events])
  const words = useMemo(() => searchWords(filter.text), [filter.text])

  const open = async (event: GitHubEvent) => {
    setOpenFailed(false)
    try {
      const result = await invoke('shell:openGitHub', { url: event.url })
      if (!result.ok) setOpenFailed(true)
    } catch {
      setOpenFailed(true)
    }
  }

  let body
  if (events.length === 0) body = <EmptyState>{t('eventList.empty')}</EmptyState>
  else if (visible.length === 0) body = <EmptyState>{t('eventList.noMatch')}</EmptyState>
  else {
    body = (
      <ul ref={listRef} className={styles.list}>
        {visible.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            words={words}
            now={now}
            emphasized={emphasis?.eventId === event.id}
            onOpen={(item) => void open(item)}
          />
        ))}
      </ul>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="event-list-title">
      <h2 id="event-list-title" className={styles.heading}>
        {t('eventList.title')}
      </h2>
      <EventFilterBar filter={filter} repositories={repositories} onChange={setFilter} />
      {openFailed ? (
        <p role="alert" className={styles.error}>
          {t('eventList.openFailed')}
        </p>
      ) : null}
      {body}
    </section>
  )
}
