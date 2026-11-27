// サインインしているアカウント（使い始めの案内の手順2に戻ったときと、手順5）。
// GitHub から取った文字は文字としてだけ出す（security-rules.md S-05）。
import { useT } from '../../i18n'
import styles from './onboarding.module.css'

export function SignedInAs({ login }: { login: string | undefined }) {
  const t = useT()
  if (login === undefined) return null
  return (
    <p className={styles.account}>
      <span>{t('onboarding.finish.signedInAs')}</span>
      <strong>{login}</strong>
    </p>
  )
}
