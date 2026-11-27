// デスクトップ通知の設定（F-09、AC-09・10）。出来事の種類ごとと、bot の発言。オフでも出来事の一覧には出る。
// 送るときは desktopNotification を丸ごと送る（ipc-contract.md 2.）。
import { EVENT_TYPES, type DesktopNotificationSettings } from '../../../shared/domain'
import { useT } from '../../i18n'
import { Toggle } from '../../ui/Toggle'
import { SettingsSection } from './SettingsSection'
import styles from './DesktopNotificationSection.module.css'

export function DesktopNotificationSection({
  value,
  onChange,
}: {
  value: DesktopNotificationSettings
  onChange: (value: DesktopNotificationSettings) => void
}) {
  const t = useT()
  return (
    <SettingsSection title={t('settings.desktopNotification.title')}>
      <p className={styles.description}>{t('settings.desktopNotification.description')}</p>
      {EVENT_TYPES.map((type) => (
        <Toggle
          key={type}
          label={t(`eventType.${type}`)}
          checked={value.byType[type] ?? true}
          onChange={(checked) =>
            onChange({ ...value, byType: { ...value.byType, [type]: checked } })
          }
        />
      ))}
      <Toggle
        label={t('settings.desktopNotification.bots')}
        checked={value.bots}
        onChange={(bots) => onChange({ ...value, bots })}
      />
    </SettingsSection>
  )
}
