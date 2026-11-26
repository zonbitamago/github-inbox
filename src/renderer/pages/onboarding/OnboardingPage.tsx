// 使い始めの案内（component-frontend.md 3.）。S1 は仮の画面。手順は S2（サインイン）・S6（全体）で作る。
import { useT } from '../../i18n'
import styles from './OnboardingPage.module.css'

export function OnboardingPage() {
  const t = useT()
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('onboarding.title')}</h1>
      <p>{t('onboarding.preparing')}</p>
    </main>
  )
}
