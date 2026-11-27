// PR の一覧（component-frontend.md 2.2 の pr-list。F-14〜F-18・F-20）。
// 一覧はメインが取り、更新の新しい順で届く（prs:updated）。リロードはメインに頼み（prs:reload）、取得の状況と失敗は AppState.prList で出す。
// 取れなかったときも、前に取った一覧は残して出す。絞り込みは画面の中だけの状態で、保存しない（component-frontend.md 4.）。
// 開くのはメインに頼む（URL はメインが確かめる。I-8）。
import { useMemo, useState } from 'react'
import type { PullRequestItem } from '../../../shared/domain'
import type { AppState, IpcErrorCode, PrListSnapshot } from '../../../shared/ipc-contract'
import { useLanguage, useT, type MessageKey } from '../../i18n'
import { formatDateTime, formatDays, formatRelativeTime } from '../../i18n/format'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { searchWords } from '../../ui/highlight'
import { useNow } from '../../ui/use-now'
import { NO_FILTER, filterPrs, repositoriesOf, type PrFilter } from './filter-prs'
import { PrFilterBar } from './PrFilterBar'
import { PrRow } from './PrRow'
import styles from './PrListPanel.module.css'

/** 「5分前」の表し方を進める間隔 */
const CLOCK_TICK_MS = 60 * 1000

/** 取れなかった理由の文言（ipc-contract.md 4.） */
function errorMessage(code: IpcErrorCode): MessageKey {
  switch (code) {
    case 'offline':
      return 'prList.error.offline'
    case 'rate_limited':
      return 'prList.error.rateLimited'
    case 'github_error':
      return 'prList.error.githubError'
    case 'auth_failed':
    case 'not_signed_in':
      return 'prList.error.signIn'
    default:
      return 'prList.error.other'
  }
}

export function PrListPanel({
  prList,
  status,
}: {
  /** 最後に取った一覧。まだ取っていなければ null */
  prList: PrListSnapshot | null
  /** 取得の状況（AppState.prList） */
  status: AppState['prList']
}) {
  const t = useT()
  const language = useLanguage()
  const invoke = useInvoke()
  const now = useNow(CLOCK_TICK_MS)
  const [filter, setFilter] = useState<PrFilter>(NO_FILTER)
  const [openFailed, setOpenFailed] = useState(false)
  const [reloadFailed, setReloadFailed] = useState(false)

  const items = useMemo(() => prList?.items ?? [], [prList])
  const visible = useMemo(() => filterPrs(items, filter), [items, filter])
  const repositories = useMemo(() => repositoriesOf(items), [items])
  const words = useMemo(() => searchWords(filter.text), [filter.text])

  // 取得中にもう一度押しても、メインは今の取得の結果を返す（component-backend.md 5.3）
  const reload = async () => {
    setReloadFailed(false)
    try {
      await invoke('prs:reload')
    } catch {
      setReloadFailed(true)
    }
  }

  const open = async (item: PullRequestItem) => {
    setOpenFailed(false)
    try {
      const result = await invoke('shell:openGitHub', { url: item.url })
      if (!result.ok) setOpenFailed(true)
    } catch {
      setOpenFailed(true)
    }
  }

  let error: MessageKey | undefined
  if (status.error !== undefined) error = errorMessage(status.error)
  else if (reloadFailed) error = 'prList.error.other'

  let body
  if (prList === null) {
    body = status.loading ? null : <EmptyState>{t('prList.notFetched')}</EmptyState>
  } else if (items.length === 0) body = <EmptyState>{t('prList.empty')}</EmptyState>
  else if (visible.length === 0) body = <EmptyState>{t('prList.noMatch')}</EmptyState>
  else {
    body = (
      <ul className={styles.list}>
        {visible.map((item) => (
          <PrRow key={item.id} item={item} words={words} now={now} onOpen={(pr) => void open(pr)} />
        ))}
      </ul>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="pr-list-title">
      <div className={styles.header}>
        <h2 id="pr-list-title" className={styles.heading}>
          {t('prList.title')}
        </h2>
        {prList === null ? null : (
          <span className={styles.meta}>
            <span>
              {t('prList.period')} {formatDays(prList.periodDays, language)}
            </span>
            <span>
              {t('prList.fetchedAt')}{' '}
              <time dateTime={prList.fetchedAt} title={formatDateTime(prList.fetchedAt, language)}>
                {formatRelativeTime(prList.fetchedAt, now, language)}
              </time>
            </span>
          </span>
        )}
        {/* 読み上げに知らせるため、取得中の表示の入れ物は常に置く */}
        <span role="status" className={styles.loading}>
          {status.loading ? t('prList.loading') : ''}
        </span>
        <Button onClick={() => void reload()}>{t('prList.reload')}</Button>
      </div>
      <PrFilterBar filter={filter} repositories={repositories} onChange={setFilter} />
      {error === undefined ? null : (
        <p role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
      {openFailed ? (
        <p role="alert" className={styles.error}>
          {t('prList.openFailed')}
        </p>
      ) : null}
      {body}
    </section>
  )
}
