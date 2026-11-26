import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// eslint.config.mjs の決まりが本当に効いているかを、架空のコードで確かめる（coding-standards.md 9.）。
// 設定の書き間違いで決まりが黙って効かなくなるのを防ぐ。決まりを変えたら、ここも直す。

const PROBES = {
  feature: 'src/renderer/features/event-list/LintProbe.tsx',
  featureClass: 'src/renderer/features/event-list/LintProbeClass.tsx',
  ui: 'src/renderer/ui/LintProbe.tsx',
  core: 'src/main/core/lint-probe.ts',
  store: 'src/main/store/lint-probe.ts',
}

// 架空のファイルはディスクに無いので、型の情報は既定の設定で作る
const eslint = new ESLint({
  overrideConfig: {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', ...Object.values(PROBES)],
          defaultProject: 'tsconfig.web.json',
        },
        tsconfigRootDir: process.cwd(),
      },
    },
  },
})

/** 「行:決まりの名前」の並び */
async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).map((m) => `${m.line}:${m.ruleId ?? m.message}`).toSorted()
}

describe('ESLint の決まりが効いている', { timeout: 60_000 }, () => {
  it('画面: 文言の直書き・1ファイルに部品2つ・style（coding-standards.md 4.・7.）', async () => {
    const code = [
      'export function A() { return <p>こんにちは</p> }',
      "export function B() { return <p style={{ margin: 0 }}>{'x'}</p> }",
      "export const label = '日本語'",
      "export const error = new Error('開発者向けの日本語は通す')",
    ].join('\n')
    expect(await lint(PROBES.feature, code)).toEqual([
      '1:react/jsx-no-literals',
      '2:react/forbid-dom-props',
      '2:react/no-multi-comp',
      '3:no-restricted-syntax',
    ])
  })

  it('画面: 部品は関数で書く（coding-standards.md 1.）', async () => {
    const code = ["import { Component } from 'react'", 'export class C extends Component {}'].join(
      '\n',
    )
    expect(await lint(PROBES.featureClass, code)).toEqual(['2:no-restricted-syntax'])
  })

  it('HTML として書き込まない（security-rules.md S-05）', async () => {
    const code = [
      'export function write(el: HTMLElement) {',
      "  el.innerHTML = 'x'",
      "  el.insertAdjacentHTML('beforeend', 'x')",
      '}',
    ].join('\n')
    expect(await lint(PROBES.ui, code)).toEqual([
      '2:no-restricted-syntax',
      '3:no-restricted-syntax',
    ])
  })

  it('core は時計・乱数・process に触れない（ADR-011）', async () => {
    const code = [
      'export const a = Date.now()',
      'export const b = new Date()',
      'export const c = Math.random()',
      'export const d = typeof process',
      "export const e = new Date('2026-01-01T00:00:00Z')",
    ].join('\n')
    expect(await lint(PROBES.core, code)).toEqual([
      '1:no-restricted-syntax',
      '2:no-restricted-syntax',
      '3:no-restricted-syntax',
      '4:no-restricted-globals',
    ])
  })

  it('名前と型の主張（coding-standards.md 3.・4.）', async () => {
    const code = [
      'export const notification = 1',
      'export const desktopNotification = 2',
      'export const githubNotifications = 3',
      "export const channels = { 'os:openNotificationSettings': 4 }",
      "export const parsed = JSON.parse('1') as number",
      'export const 名前 = 5',
      'export const fixed = [1, 2] as const',
    ].join('\n')
    expect(await lint(PROBES.store, code)).toEqual([
      '1:@typescript-eslint/naming-convention',
      '5:@typescript-eslint/consistent-type-assertions',
      '6:id-match',
    ])
  })
})
