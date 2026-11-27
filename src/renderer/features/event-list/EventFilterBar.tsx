// 出来事の一覧の絞り込みの帯（component-frontend.md 2.2 の EventFilterBar。文字・種類・リポジトリ。F-13）。
import { EVENT_TYPES, type EventType } from '../../../shared/domain'
import { useT } from '../../i18n'
import { Button } from '../../ui/Button'
import { Select } from '../../ui/Select'
import { TextInput } from '../../ui/TextInput'
import { NO_FILTER, isFiltering, type EventFilter } from './filter-events'
import styles from './EventFilterBar.module.css'

/** 選択欄の「すべて」の値 */
const ALL = ''

const isEventType = (value: string): value is EventType =>
  EVENT_TYPES.some((type) => type === value)

export function EventFilterBar({
  filter,
  repositories,
  onChange,
}: {
  filter: EventFilter
  repositories: readonly string[]
  onChange: (filter: EventFilter) => void
}) {
  const t = useT()
  return (
    <div role="search" aria-label={t('eventList.filter.label')} className={styles.bar}>
      <div className={styles.text}>
        <TextInput
          label={t('eventList.filter.text')}
          value={filter.text}
          onChange={(text) => onChange({ ...filter, text })}
        />
      </div>
      <Select
        label={t('eventList.filter.type')}
        value={filter.type ?? ALL}
        options={[
          { value: ALL, label: t('common.all') },
          ...EVENT_TYPES.map((type) => ({ value: type, label: t(`eventType.${type}`) })),
        ]}
        onChange={(value) => onChange({ ...filter, type: isEventType(value) ? value : undefined })}
      />
      <Select
        label={t('eventList.filter.repository')}
        value={filter.repository ?? ALL}
        options={[
          { value: ALL, label: t('common.all') },
          ...repositories.map((repository) => ({ value: repository, label: repository })),
        ]}
        onChange={(value) => onChange({ ...filter, repository: value === ALL ? undefined : value })}
      />
      {isFiltering(filter) ? (
        <div className={styles.clear}>
          <Button onClick={() => onChange(NO_FILTER)}>{t('eventList.filter.clear')}</Button>
        </div>
      ) : null}
    </div>
  )
}
