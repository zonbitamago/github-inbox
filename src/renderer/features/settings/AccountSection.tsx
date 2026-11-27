// アカウント（F-28、auth-flow.md 6.）。サインインしているユーザー名とサインアウト。
// サインアウトはこの PC のトークンと出来事を消すため、押したら一度確かめる（AI案）。
// アプリからは GitHub 側のトークンを取り消せないため、トークンの設定ページを開けるようにして取り消しを勧める。
import { useState } from 'react'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { SettingsSection } from './SettingsSection'
import styles from './SettingsForm.module.css'

/** classic PAT の一覧のページ（auth-flow.md 6.） */
const TOKEN_SETTINGS_URL = 'https://github.com/settings/tokens'

export function AccountSection({ login }: { login: string | undefined }) {
  const t = useT()
  const invoke = useInvoke()
  const [confirming, setConfirming] = useState(false)
  const [failed, setFailed] = useState<'signOut' | 'openTokens' | undefined>(undefined)

  const signOut = async () => {
    setFailed(undefined)
    try {
      const result = await invoke('auth:signOut')
      if (!result.ok) setFailed('signOut')
    } catch {
      setFailed('signOut')
    }
  }

  const openTokens = async () => {
    setFailed(undefined)
    try {
      const result = await invoke('shell:openGitHub', { url: TOKEN_SETTINGS_URL })
      if (!result.ok) setFailed('openTokens')
    } catch {
      setFailed('openTokens')
    }
  }

  return (
    <SettingsSection title={t('settings.account.title')}>
      {login === undefined ? null : (
        <p className={styles.account}>
          <span>{t('settings.account.signedInAs')}</span>
          <strong>{login}</strong>
        </p>
      )}
      {confirming ? (
        <div className={styles.confirm}>
          <p className={styles.text}>{t('settings.account.signOutConfirm')}</p>
          <div className={styles.buttons}>
            <Button variant="primary" onClick={() => void signOut()}>
              {t('settings.account.signOutConfirmButton')}
            </Button>
            <Button onClick={() => setConfirming(false)}>{t('settings.account.cancel')}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)}>{t('settings.account.signOut')}</Button>
      )}
      <p className={styles.text}>{t('settings.account.revokeNotice')}</p>
      <Button onClick={() => void openTokens()}>{t('settings.account.openTokens')}</Button>
      {failed === undefined ? null : (
        <p role="alert" className={styles.error}>
          {t(
            failed === 'signOut'
              ? 'settings.account.signOutFailed'
              : 'settings.account.openTokensFailed',
          )}
        </p>
      )}
    </SettingsSection>
  )
}
