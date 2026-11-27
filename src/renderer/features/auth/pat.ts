// PAT でのサインイン（auth-flow.md 3.、component-frontend.md 3. の手順2）の、部品から切り離した決まり。
import type { IpcErrorCode } from '../../../shared/ipc-contract'
import type { MessageKey } from '../../i18n'

/** スコープと説明を入れた、classic PAT の作成ページ（auth-flow.md 3.） */
export const PAT_CREATE_URL =
  'https://github.com/settings/tokens/new?scopes=repo,notifications&description=github-inbox'

/** サインインに失敗したときに出す文言。何をすればよいかの一言を添える（design-system.md 6.） */
export function patErrorMessage(code: IpcErrorCode): MessageKey {
  switch (code) {
    case 'pat_invalid':
      return 'auth.pat.error.invalid'
    case 'pat_missing_scope':
      return 'auth.pat.error.missingScope'
    case 'offline':
      return 'auth.pat.error.offline'
    case 'rate_limited':
      return 'auth.pat.error.rateLimited'
    case 'encryption_unavailable':
      return 'auth.pat.error.encryptionUnavailable'
    default:
      return 'auth.pat.error.other'
  }
}
