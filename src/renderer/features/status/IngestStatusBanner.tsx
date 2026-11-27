// 受け取れていないことの知らせ（component-frontend.md 2.2 の IngestStatusBanner、N-08、AC-14）。
// 理由と、できること（サインインし直す・待つ）を出す。受け取れるようになったら、メインの状態が変わって消える。
import type { MessageKey } from '../../i18n'
import { useLanguage, useT } from '../../i18n'
import { formatDateTime } from '../../i18n/format'
import { Banner, type BannerTone } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import type { IngestNotice, IngestNoticeKind } from './ingest-notice'
import styles from './IngestStatusBanner.module.css'

const MESSAGES: Record<IngestNoticeKind, MessageKey> = {
  auth_failed: 'ingestStatus.authFailed',
  rate_limited: 'ingestStatus.rateLimited',
  offline: 'ingestStatus.offline',
  github_error: 'ingestStatus.githubError',
  syncing: 'ingestStatus.syncing',
}

/** design-system.md 6.: 認証切れは danger、ネットワーク・利用制限・GitHub の障害は warning、取り込み中は neutral */
const TONES: Record<IngestNoticeKind, BannerTone> = {
  auth_failed: 'danger',
  rate_limited: 'warning',
  offline: 'warning',
  github_error: 'warning',
  syncing: 'neutral',
}

export function IngestStatusBanner({
  notice,
  onSignInAgain,
}: {
  notice: IngestNotice
  onSignInAgain: () => void
}) {
  const t = useT()
  const language = useLanguage()
  return (
    <Banner tone={TONES[notice.kind]}>
      <span>{t(MESSAGES[notice.kind])}</span>
      {notice.kind === 'rate_limited' && notice.retryAt !== undefined ? (
        <span className={styles.time}>
          <span>{t('ingestStatus.retryAt')}</span>
          <time dateTime={notice.retryAt}>{formatDateTime(notice.retryAt, language)}</time>
        </span>
      ) : null}
      {notice.kind !== 'syncing' && notice.lastSuccessAt !== undefined ? (
        <span className={styles.time}>
          <span>{t('ingestStatus.lastSuccessAt')}</span>
          <time dateTime={notice.lastSuccessAt}>
            {formatDateTime(notice.lastSuccessAt, language)}
          </time>
        </span>
      ) : null}
      {notice.kind === 'auth_failed' ? (
        <Button variant="primary" onClick={onSignInAgain}>
          {t('ingestStatus.signInAgain')}
        </Button>
      ) : null}
    </Banner>
  )
}
