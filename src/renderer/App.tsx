// 画面の切り替え（component-frontend.md 1.）。ルーターは使わず、メインから届く AppState で出す画面を1つに決める。
import type { AppState } from '../shared/ipc-contract'
import { useT } from './i18n'
import { useMainSnapshot } from './main-store/use-main-store'
import { KeychainNoticePage } from './pages/keychain-notice/KeychainNoticePage'
import { MainPage } from './pages/main/MainPage'
import { OnboardingPage } from './pages/onboarding/OnboardingPage'
import styles from './App.module.css'

export type PageName = 'keychain_notice' | 'signing_in' | 'onboarding' | 'main'

/** 上から順に当てはめる。設定の画面（開いているか）は画面の中だけの状態なので S6 で足す */
export function selectPage(state: AppState): PageName {
  if (state.auth.status === 'keychain_notice') return 'keychain_notice'
  if (state.auth.status === 'signing_in') return 'signing_in'
  if (state.onboardingRequired || state.auth.status === 'signed_out') return 'onboarding'
  return 'main'
}

export function App() {
  const { loaded, loadFailed, appState, events } = useMainSnapshot()
  const t = useT()
  if (loadFailed) return <p className={styles.message}>{t('common.loadFailed')}</p>
  if (!loaded || appState === null) return <p className={styles.message}>{t('common.loading')}</p>
  switch (selectPage(appState)) {
    case 'keychain_notice':
      return <KeychainNoticePage />
    case 'signing_in':
      return <OnboardingPage signInOnly />
    case 'onboarding':
      return <OnboardingPage />
    case 'main':
      return <MainPage events={events} />
  }
}
