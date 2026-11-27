import { describe, expect, it } from 'vitest'
import { translate } from '../../i18n'
import { PAT_CREATE_URL, patErrorMessage } from './pat'

describe('サインインに失敗したときの文言（ipc-contract.md 4.）', () => {
  it.each([
    ['pat_invalid', '貼り間違いや有効期限切れ'],
    ['pat_missing_scope', 'repo のスコープがありません'],
    ['offline', 'GitHub につながりません'],
    ['rate_limited', '利用制限'],
    ['encryption_unavailable', '安全な保管場所が使えない'],
    ['github_error', 'サインインできませんでした'],
    ['internal', 'サインインできませんでした'],
    ['invalid_argument', 'サインインできませんでした'],
  ] as const)('%s → 「%s」を含む', (code, expected) => {
    expect(translate('ja', patErrorMessage(code))).toContain(expected)
  })
})

describe('PAT の作成ページ（auth-flow.md 3.）', () => {
  it('classic の作成ページに、repo と notifications のスコープを入れて開く', () => {
    const url = new URL(PAT_CREATE_URL)
    expect(url.origin + url.pathname).toBe('https://github.com/settings/tokens/new')
    expect(url.searchParams.get('scopes')).toBe('repo,notifications')
    expect(url.searchParams.get('description')).toBe('github-inbox')
  })
})
