// 使い始めの案内の1つの手順の枠（component-frontend.md 3.）。何番目の手順か・見出し・中身・戻ると進むのボタン。
// 進むボタンの文言（次へ・飛ばす・あとで）は手順が決める。見出しは、中身が自分で見出しを持つとき（サインイン）は省く。
import type { ReactNode } from 'react'
import { fillMessage, useT } from '../../i18n'
import { Button } from '../../ui/Button'
import styles from './OnboardingStep.module.css'

export interface StepForward {
  label: string
  onClick: () => void
  primary?: boolean
}

export function OnboardingStep({
  position,
  title,
  children,
  onBack,
  forward,
}: {
  position: { current: number; total: number }
  title?: string
  children: ReactNode
  /** 無ければ戻るボタンを出さない */
  onBack?: (() => void) | undefined
  /** 無ければ進むボタンを出さない */
  forward?: StepForward | undefined
}) {
  const t = useT()
  return (
    <section className={styles.step}>
      <p className={styles.position}>{fillMessage(t('onboarding.step'), position)}</p>
      {title === undefined ? null : <h2 className={styles.title}>{title}</h2>}
      <div className={styles.body}>{children}</div>
      {onBack === undefined && forward === undefined ? null : (
        <div className={styles.nav}>
          {onBack === undefined ? null : <Button onClick={onBack}>{t('onboarding.back')}</Button>}
          {forward === undefined ? null : (
            <Button
              variant={forward.primary === true ? 'primary' : 'secondary'}
              onClick={forward.onClick}
            >
              {forward.label}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
