import { describe, expect, it } from 'vitest'
import { checkGuardChanges, isGuardFile } from '../../scripts/check-guard-changes'

// build-plan.md 6.3: 検査の設定・テストを変える PR は、本文の「決まり（検査）を変えた」に印が要る
const CHECKED = '- [x] 決まり（検査）を変えた。理由と、緩めたか強めたかを上に書いた'
const UNCHECKED = '- [ ] 決まり（検査）を変えた。理由と、緩めたか強めたかを上に書いた'

describe('検査の設定・テストの変更の申告', () => {
  it.each([
    ['検査に触れない', ['src/main/store/events-store.ts'], false, UNCHECKED, 'alice', true],
    ['ESLint の設定を変えて印が無い', ['eslint.config.mjs'], false, UNCHECKED, 'alice', false],
    ['ESLint の設定を変えて印がある', ['eslint.config.mjs'], false, CHECKED, 'alice', true],
    ['package.json の scripts を変えて印が無い', ['package.json'], true, UNCHECKED, 'alice', false],
    [
      'package.json の部品の版だけ',
      ['package.json', 'package-lock.json'],
      false,
      UNCHECKED,
      'alice',
      true,
    ],
    [
      'ワークフローを Dependabot が変えた',
      ['.github/workflows/ci.yml'],
      false,
      UNCHECKED,
      'dependabot[bot]',
      true,
    ],
  ])('%s', (_name, changedFiles, packageScriptsChanged, prBody, prAuthor, ok) => {
    expect(checkGuardChanges({ changedFiles, packageScriptsChanged, prBody, prAuthor }).ok).toBe(ok)
  })

  it('落ちたときは、変わった検査のファイルを並べる', () => {
    const result = checkGuardChanges({
      changedFiles: ['test/config/csp.test.ts', 'src/renderer/App.tsx'],
      packageScriptsChanged: true,
      prBody: '',
      prAuthor: 'alice',
    })
    expect(result.message).toContain('  - test/config/csp.test.ts')
    expect(result.message).toContain('  - package.json の scripts')
    expect(result.message).not.toContain('App.tsx')
  })

  it.each([
    ['eslint.config.mjs', true],
    ['.prettierrc.json', true],
    ['tsconfig.web.json', true],
    ['vitest.config.mts', true],
    ['test/config/csp.test.ts', true],
    ['test/contract/ipc-contract.test.ts', true],
    ['scripts/check-publish.ts', true],
    ['.github/pull_request_template.md', true],
    ['.claude/settings.json', true],
    ['scripts/fixtures/record.ts', false],
    ['test/support/markdown.ts', false],
    ['src/main/core/constants.ts', false],
  ])('%s は検査のファイルか: %s', (path, expected) => {
    expect(isGuardFile(path)).toBe(expected)
  })
})
