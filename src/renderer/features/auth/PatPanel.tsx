// PAT でのサインイン（component-frontend.md 2.2 の PatPanel・3. の手順2、auth-flow.md 3.）。
// 作り方の手順・repo スコープの説明・作成ページを開くボタン・貼り付け欄。
// 確かめと保存はメインが行い、成功したら state:changed で画面が切り替わる（component-frontend.md 4.）。
import { useState, type FormEvent } from 'react'
import type { MessageKey } from '../../i18n'
import { useT } from '../../i18n'
import { useInvoke } from '../../main-store/use-main-store'
import { Button } from '../../ui/Button'
import { TextInput } from '../../ui/TextInput'
import { PAT_CREATE_URL, patErrorMessage } from './pat'
import styles from './PatPanel.module.css'

/** auth:submitPat の引数の長さの上限（ipc-contract.md 2.） */
const TOKEN_MAX_LENGTH = 255

export function PatPanel({
  title,
  onSignedIn,
}: {
  title: MessageKey
  /** サインインできたとき（メインの画面の「サインインし直す」で、一覧に戻るため。CR-008） */
  onSignedIn?: () => void
}) {
  const t = useT()
  const invoke = useInvoke()
  const [token, setToken] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)

  const openCreatePage = async () => {
    setError(null)
    try {
      const result = await invoke('shell:openGitHub', { url: PAT_CREATE_URL })
      if (!result.ok) setError('auth.pat.openFailed')
    } catch {
      setError('auth.pat.openFailed')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setChecking(true)
    setError(null)
    try {
      const result = await invoke('auth:submitPat', { token })
      if (result.ok) {
        setToken('')
        onSignedIn?.()
      } else setError(patErrorMessage(result.error.code))
    } catch {
      setError('auth.pat.error.other')
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t(title)}</h2>
      <p>{t('auth.pat.intro')}</p>
      <p className={styles.notice}>{t('auth.pat.scopeNotice')}</p>
      <ol className={styles.steps}>
        <li>{t('auth.pat.step.open')}</li>
        <li>{t('auth.pat.step.generate')}</li>
        <li>{t('auth.pat.step.paste')}</li>
      </ol>
      <div>
        <Button onClick={() => void openCreatePage()}>{t('auth.pat.openCreatePage')}</Button>
      </div>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <TextInput
          label={t('auth.pat.tokenLabel')}
          value={token}
          onChange={setToken}
          secret
          disabled={checking}
          maxLength={TOKEN_MAX_LENGTH}
        />
        <div>
          <Button variant="primary" submit disabled={checking || token.trim() === ''}>
            {checking ? t('auth.pat.checking') : t('auth.pat.submit')}
          </Button>
        </div>
      </form>
      {error === null ? null : (
        <p role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
    </section>
  )
}
