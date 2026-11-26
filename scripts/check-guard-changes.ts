// 検査（機械で強制する決まり）を黙って変えないための CI の検査（build-plan.md 6.3、coding-standards.md 9.）。
// 決まりを機械に任せるほど、人は「決まりそのものの変更」だけを見ればよくなる。その変更を見落とさないように、
// 検査の設定・テストを変えた PR は、本文の「決まり（検査）を変えた」に印が要る（印は技術者が PR で見る）。
//
// CI では BASE_SHA（PR の基のコミット）・PR_BODY（PR の本文）・PR_AUTHOR（PR を作った人）を環境変数で受け取る。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export interface GuardChangesInput {
  changedFiles: string[]
  /** package.json の scripts（lint・test などの動かし方）が変わったか */
  packageScriptsChanged: boolean
  prBody: string
  prAuthor: string
}

export interface GuardChangesResult {
  ok: boolean
  message: string
}

/** 検査の設定・テスト。ここを変えると、機械で強制する決まりが変わる */
const GUARD_PATTERNS = [
  /^eslint\.config\.mjs$/,
  /^\.dependency-cruiser\.cjs$/,
  /^\.prettier(?:rc\.json|ignore)$/,
  /^tsconfig(?:\.[\w-]+)?\.json$/,
  /^vitest\.config\.mts$/,
  /^test\/(?:config|contract)\//,
  /^scripts\/check-[\w-]+\.ts$/,
  /^\.github\//,
  /^\.claude\/settings\.json$/,
]

export const isGuardFile = (path: string) => GUARD_PATTERNS.some((pattern) => pattern.test(path))

const DECLARED = /^\s*-\s*\[[xX]\]\s*決まり（検査）を変えた/m

/** Action の版を上げる Dependabot の PR は、本文を作り直されるため印を付けられない。版の上げだけなので見ない */
const DEPENDABOT = 'dependabot[bot]'

export function checkGuardChanges(input: GuardChangesInput): GuardChangesResult {
  const guardFiles = input.changedFiles.filter(isGuardFile)
  const changed = input.packageScriptsChanged
    ? [...guardFiles, 'package.json の scripts']
    : guardFiles
  if (changed.length === 0) {
    return { ok: true, message: '検査の設定・テストは変わっていない' }
  }
  if (input.prAuthor === DEPENDABOT) {
    return { ok: true, message: 'Dependabot の版の上げ（技術者が PR で見る）' }
  }
  if (DECLARED.test(input.prBody)) {
    return {
      ok: true,
      message: 'PR の本文で「決まり（検査）を変えた」に印が付いている（技術者が確かめる）',
    }
  }
  return {
    ok: false,
    message: [
      '検査の設定・テストが変わっているのに、PR の本文の「決まり（検査）を変えた」に印が無い。',
      '決まりを変えるときは技術者に聞き、変えた理由と、緩めたか強めたかを PR の本文に書いて印を付ける（build-plan.md 6.3）。',
      ...changed.map((path) => `  - ${path}`),
    ].join('\n'),
  }
}

function scriptsOf(json: string): string {
  const parsed: unknown = JSON.parse(json)
  const scripts =
    parsed !== null && typeof parsed === 'object' && 'scripts' in parsed
      ? parsed.scripts
      : undefined
  return JSON.stringify(scripts ?? {})
}

if (import.meta.main) {
  const base = process.env['BASE_SHA']
  if (base === undefined || base === '') {
    console.log('PR ではないため、見ない')
  } else {
    const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf-8' })
    const changedFiles = git(['diff', '--name-only', `${base}...HEAD`])
      .split('\n')
      .filter((path) => path !== '')
    const packageScriptsChanged =
      scriptsOf(git(['show', `${base}:package.json`])) !==
      scriptsOf(readFileSync('package.json', 'utf-8'))
    const result = checkGuardChanges({
      changedFiles,
      packageScriptsChanged,
      prBody: process.env['PR_BODY'] ?? '',
      prAuthor: process.env['PR_AUTHOR'] ?? '',
    })
    console.log(result.message)
    if (!result.ok) process.exitCode = 1
  }
}
