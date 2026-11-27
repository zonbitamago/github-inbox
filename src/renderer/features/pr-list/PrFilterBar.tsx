// PR の一覧の絞り込みの帯（component-frontend.md 2.2 の PrFilterBar。文字・状態・リポジトリ・自分待ちの理由。F-18）。
// 理由には「自分待ちの理由あり（どれか1つ）」も入れる（AC-22）。
import { PULL_REQUEST_STATES, WAITING_REASONS, type PullRequestState } from '../../../shared/domain'
import { useT } from '../../i18n'
import { Button } from '../../ui/Button'
import { Select } from '../../ui/Select'
import { TextInput } from '../../ui/TextInput'
import { ANY_REASON, NO_FILTER, isFiltering, type PrFilter, type ReasonFilter } from './filter-prs'
import styles from './PrFilterBar.module.css'

/** 選択欄の「すべて」の値 */
const ALL = ''

const isState = (value: string): value is PullRequestState =>
  PULL_REQUEST_STATES.some((state) => state === value)

const isReason = (value: string): value is ReasonFilter =>
  value === ANY_REASON || WAITING_REASONS.some((reason) => reason === value)

export function PrFilterBar({
  filter,
  repositories,
  onChange,
}: {
  filter: PrFilter
  repositories: readonly string[]
  onChange: (filter: PrFilter) => void
}) {
  const t = useT()
  return (
    <div role="search" aria-label={t('prList.filter.label')} className={styles.bar}>
      <div className={styles.text}>
        <TextInput
          label={t('prList.filter.text')}
          value={filter.text}
          onChange={(text) => onChange({ ...filter, text })}
        />
      </div>
      <Select
        label={t('prList.filter.state')}
        value={filter.state ?? ALL}
        options={[
          { value: ALL, label: t('common.all') },
          ...PULL_REQUEST_STATES.map((state) => ({ value: state, label: t(`prState.${state}`) })),
        ]}
        onChange={(value) => onChange({ ...filter, state: isState(value) ? value : undefined })}
      />
      <Select
        label={t('prList.filter.repository')}
        value={filter.repository ?? ALL}
        options={[
          { value: ALL, label: t('common.all') },
          ...repositories.map((repository) => ({ value: repository, label: repository })),
        ]}
        onChange={(value) => onChange({ ...filter, repository: value === ALL ? undefined : value })}
      />
      <Select
        label={t('prList.filter.reason')}
        value={filter.reason ?? ALL}
        options={[
          { value: ALL, label: t('common.all') },
          { value: ANY_REASON, label: t('prList.filter.anyReason') },
          ...WAITING_REASONS.map((reason) => ({
            value: reason,
            label: t(`waitingReason.${reason}`),
          })),
        ]}
        onChange={(value) => onChange({ ...filter, reason: isReason(value) ? value : undefined })}
      />
      {isFiltering(filter) ? (
        <div className={styles.clear}>
          <Button onClick={() => onChange(NO_FILTER)}>{t('prList.filter.clear')}</Button>
        </div>
      ) : null}
    </div>
  )
}
