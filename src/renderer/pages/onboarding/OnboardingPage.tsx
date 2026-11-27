// 使い始めの案内（component-frontend.md 3.）。S2 は手順2（サインイン）と手順5（終わり）。
// 手順1（アプリケーションフォルダへ移す）・3（GitHub の通知設定）・4（試しのデスクトップ通知）と、戻る・飛ばすは S6 で足す。
// signInOnly は、認証し直す画面（auth.status = 'signing_in'）で、手順2だけを出す（component-frontend.md 1.）。
import { PatPanel } from '../../features/auth/PatPanel'
import { FinishStep } from '../../features/onboarding/FinishStep'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import styles from './OnboardingPage.module.css'

export function OnboardingPage({ signInOnly = false }: { signInOnly?: boolean }) {
  const t = useT()
  const auth = useMainSnapshot().appState?.auth
  if (signInOnly) {
    return (
      <main className={styles.page}>
        <PatPanel title="auth.signIn.again" />
      </main>
    )
  }
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('onboarding.title')}</h1>
      {auth?.status === 'signed_in' ? (
        <FinishStep login={auth.login} />
      ) : (
        <PatPanel title="auth.signIn.title" />
      )}
    </main>
  )
}
