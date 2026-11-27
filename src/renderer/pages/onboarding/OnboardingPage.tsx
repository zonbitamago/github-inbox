// 使い始めの案内（component-frontend.md 3.、F-36、AC-29・41）。手順1（Mac でアプリケーションフォルダの外のときだけ）・
// 2（サインイン）・3（GitHub の通知設定）・4（試しのデスクトップ通知）・5（終わり）を1つずつ出す。
// 手順2〜4は戻れる。手順3・4は飛ばせる（設定の「使い始めの案内をもう一度」で戻れる）。進むボタンは、その手順でやることを
// 済ませたら「次へ」、済ませていなければ「飛ばす」（手順1は「あとで」）（⑭ S6b。AI案）。
// again は設定から開き直したとき。サインインしているので手順2を出さず、終えたら onFinished でメインの画面に戻る（2026-11-27 技術者が決めた）。
// signInOnly は、認証し直す画面（auth.status = 'signing_in'）で、手順2だけを出す（component-frontend.md 1.）。
// 手順の部品は features/onboarding、デスクトップ通知まわりの部品は features/status にあり、ここで組む（Feature どうしは読まない）。
import { useState } from 'react'
import { PatPanel } from '../../features/auth/PatPanel'
import { FinishStep } from '../../features/onboarding/FinishStep'
import { GitHubSettingsStep } from '../../features/onboarding/GitHubSettingsStep'
import { OnboardingStep, type StepForward } from '../../features/onboarding/OnboardingStep'
import { SignedInAs } from '../../features/onboarding/SignedInAs'
import { DesktopNotificationCheck } from '../../features/status/DesktopNotificationCheck'
import { MoveToApplicationsFolderButton } from '../../features/status/MoveToApplicationsFolderButton'
import { useT } from '../../i18n'
import { useMainSnapshot } from '../../main-store/use-main-store'
import styles from './OnboardingPage.module.css'

type StepId =
  'applications_folder' | 'sign_in' | 'github_settings' | 'desktop_notification' | 'finish'

/** 戻れる手順（component-frontend.md 3.） */
const CAN_GO_BACK: ReadonlySet<StepId> = new Set([
  'sign_in',
  'github_settings',
  'desktop_notification',
])

export function OnboardingPage({
  signInOnly = false,
  again = false,
  onFinished,
}: {
  signInOnly?: boolean
  again?: boolean
  onFinished?: () => void
}) {
  const t = useT()
  const appState = useMainSnapshot().appState
  const [index, setIndex] = useState(0)
  const [githubSettingsOpened, setGithubSettingsOpened] = useState(false)
  const [desktopNotificationConfirmed, setDesktopNotificationConfirmed] = useState(false)

  if (signInOnly) {
    return (
      <main className={styles.page}>
        <PatPanel title="auth.signIn.again" />
      </main>
    )
  }
  if (appState === null) return null

  const { auth, appInfo } = appState
  const steps: StepId[] = []
  if (appInfo.platform === 'darwin' && appInfo.inApplicationsFolder === false) {
    steps.push('applications_folder')
  }
  if (!again) steps.push('sign_in')
  steps.push('github_settings', 'desktop_notification', 'finish')
  const current = Math.min(index, steps.length - 1)
  const step = steps[current] ?? 'finish'
  const next = () => setIndex(current + 1)
  const position = { current: current + 1, total: steps.length }
  const onBack = current > 0 && CAN_GO_BACK.has(step) ? () => setIndex(current - 1) : undefined
  const signedIn = auth.status === 'signed_in'

  const forwardFor = (done: boolean): StepForward =>
    done
      ? { label: t('onboarding.next'), onClick: next, primary: true }
      : { label: t('onboarding.skip'), onClick: next }

  const body = () => {
    switch (step) {
      case 'applications_folder':
        return (
          <OnboardingStep
            position={position}
            title={t('onboarding.applicationsFolder.title')}
            forward={{ label: t('onboarding.later'), onClick: next }}
          >
            <p>{t('onboarding.applicationsFolder.body')}</p>
            <div className={styles.row}>
              <MoveToApplicationsFolderButton variant="primary" />
            </div>
            <p className={styles.note}>{t('onboarding.applicationsFolder.laterNote')}</p>
          </OnboardingStep>
        )
      case 'sign_in':
        // サインインしたら次の手順へ。戻ってきたときは、サインインしているアカウントを出す（サインアウトは設定から）
        return signedIn ? (
          <OnboardingStep
            position={position}
            title={t('onboarding.signIn.title')}
            onBack={onBack}
            forward={{ label: t('onboarding.next'), onClick: next, primary: true }}
          >
            <SignedInAs login={auth.login} />
          </OnboardingStep>
        ) : (
          <OnboardingStep position={position} onBack={onBack}>
            <PatPanel title="auth.signIn.title" onSignedIn={next} />
          </OnboardingStep>
        )
      case 'github_settings':
        return (
          <OnboardingStep
            position={position}
            title={t('onboarding.githubSettings.title')}
            onBack={onBack}
            forward={forwardFor(githubSettingsOpened)}
          >
            <GitHubSettingsStep onOpened={() => setGithubSettingsOpened(true)} />
          </OnboardingStep>
        )
      case 'desktop_notification':
        return (
          <OnboardingStep
            position={position}
            title={t('onboarding.desktopNotification.title')}
            onBack={onBack}
            forward={forwardFor(desktopNotificationConfirmed)}
          >
            <p>{t('onboarding.desktopNotification.intro')}</p>
            <DesktopNotificationCheck
              platform={appInfo.platform}
              inApplicationsFolder={appInfo.inApplicationsFolder}
              onConfirmed={() => setDesktopNotificationConfirmed(true)}
            />
          </OnboardingStep>
        )
      case 'finish':
        return (
          <OnboardingStep position={position} title={t('onboarding.finish.title')}>
            <FinishStep
              login={auth.login}
              loginItemEnabled={appState.loginItem.enabled}
              onCompleted={again ? onFinished : undefined}
            />
          </OnboardingStep>
        )
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('onboarding.title')}</h1>
      {body()}
    </main>
  )
}
