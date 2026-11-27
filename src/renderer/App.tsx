// 画面の切り替え（component-frontend.md 1.）。ルーターは使わず、メインから届く AppState で出す画面を1つに決める。
// 設定を開いているか・使い始めの案内を設定から開き直しているかは画面の中だけの状態（component-frontend.md 4.）。
// デスクトップ通知のクリック（F-08）で閉じる。開き直した案内を終えたら、メインの画面に戻る（⑭ S6b）。
import { useState } from 'react'
import type { AppState } from '../shared/ipc-contract'
import { useT } from './i18n'
import { useMainSnapshot } from './main-store/use-main-store'
import { KeychainNoticePage } from './pages/keychain-notice/KeychainNoticePage'
import { MainPage } from './pages/main/MainPage'
import { OnboardingPage } from './pages/onboarding/OnboardingPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import styles from './App.module.css'

export type PageName =
  'keychain_notice' | 'signing_in' | 'onboarding' | 'onboarding_again' | 'settings' | 'main'

/** 上から順に当てはめる（component-frontend.md 1.） */
export function selectPage(
  state: AppState,
  settingsOpen = false,
  onboardingAgain = false,
): PageName {
  if (state.auth.status === 'keychain_notice') return 'keychain_notice'
  if (state.auth.status === 'signing_in') return 'signing_in'
  if (state.onboardingRequired || state.auth.status === 'signed_out') return 'onboarding'
  if (onboardingAgain) return 'onboarding_again'
  if (settingsOpen) return 'settings'
  return 'main'
}

export function App() {
  const { loaded, loadFailed, appState, events, focusRequest } = useMainSnapshot()
  const t = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingAgain, setOnboardingAgain] = useState(false)
  const [seenFocusSeq, setSeenFocusSeq] = useState(focusRequest?.seq ?? null)

  // デスクトップ通知のクリックが届いたら、設定と開き直した案内を閉じて出来事の一覧に戻す（F-08）
  if (focusRequest !== null && focusRequest.seq !== seenFocusSeq) {
    setSeenFocusSeq(focusRequest.seq)
    setSettingsOpen(false)
    setOnboardingAgain(false)
  }

  if (loadFailed) return <p className={styles.message}>{t('common.loadFailed')}</p>
  if (!loaded || appState === null) return <p className={styles.message}>{t('common.loading')}</p>
  const page = selectPage(appState, settingsOpen, onboardingAgain)
  // サインアウトなどで設定の画面から離れたら、次にメインの画面に来たときに設定を開いたままにしない
  if (settingsOpen && page !== 'settings') setSettingsOpen(false)
  if (onboardingAgain && page !== 'onboarding_again') setOnboardingAgain(false)
  switch (page) {
    case 'keychain_notice':
      return <KeychainNoticePage />
    case 'signing_in':
      return <OnboardingPage signInOnly />
    case 'onboarding':
      return <OnboardingPage key="first" />
    case 'onboarding_again':
      return <OnboardingPage key="again" again onFinished={() => setOnboardingAgain(false)} />
    case 'settings':
      return (
        <SettingsPage
          onClose={() => setSettingsOpen(false)}
          onRestartOnboarding={() => {
            setSettingsOpen(false)
            setOnboardingAgain(true)
          }}
        />
      )
    case 'main':
      return <MainPage events={events} onOpenSettings={() => setSettingsOpen(true)} />
  }
}
