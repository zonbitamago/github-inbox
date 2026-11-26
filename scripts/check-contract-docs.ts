// 凍結した契約・判定を黙って変えないための CI の検査（build-plan.md 6.3）。
// PR で src/shared/・src/main/core/（テストと CLAUDE.md を除く）が変わっているのに、
// domain-model.md・docs/design/api-contract/・docs/build/change-requests/ のどれも変わっていなければ失敗にする。
// 整理だけの変更は、PR の本文の「契約・判定の変更ではない（整理だけ）」に印を付ければ通す（印は技術者が PR で見る）。
//
// CI では BASE_SHA（PR の基のコミット）と PR_BODY（PR の本文）を環境変数で受け取る。
import { execFileSync } from 'node:child_process'

export interface ContractDocsInput {
  changedFiles: string[]
  prBody: string
}

export interface ContractDocsResult {
  ok: boolean
  message: string
}

const isContractFile = (path: string) =>
  (path.startsWith('src/shared/') || path.startsWith('src/main/core/')) &&
  !/\.test\.tsx?$/.test(path) &&
  !path.endsWith('CLAUDE.md')

const isContractDoc = (path: string) =>
  path === 'docs/design/components/domain-model.md' ||
  path.startsWith('docs/design/api-contract/') ||
  path.startsWith('docs/build/change-requests/')

const REFACTOR_ONLY =
  /^\s*-\s*\[[xX]\]\s*`src\/shared\/`・`src\/main\/core\/` の変更は、契約・判定の変更ではない/m

export function checkContractDocs(input: ContractDocsInput): ContractDocsResult {
  const contractFiles = input.changedFiles.filter(isContractFile)
  if (contractFiles.length === 0) {
    return { ok: true, message: '契約・判定のファイルは変わっていない' }
  }
  if (input.changedFiles.some(isContractDoc)) {
    return { ok: true, message: '契約・判定の変更と一緒に、文書か変更要求も直してある' }
  }
  if (REFACTOR_ONLY.test(input.prBody)) {
    return { ok: true, message: 'PR の本文で「整理だけ」に印が付いている（技術者が確かめる）' }
  }
  return {
    ok: false,
    message: [
      '契約・判定のファイルが変わっているのに、文書（domain-model.md・docs/design/api-contract/）も変更要求（docs/build/change-requests/）も直していない。',
      '契約・判定を変えるなら、文書を先に直す（AGENTS.md 行動ルール 8）。整理だけなら、PR の本文の「整理だけ」に印を付ける。',
      ...contractFiles.map((path) => `  - ${path}`),
    ].join('\n'),
  }
}

if (import.meta.main) {
  const base = process.env['BASE_SHA']
  if (base === undefined || base === '') {
    console.log('PR ではないため、見ない')
  } else {
    const changedFiles = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter((path) => path !== '')
    const result = checkContractDocs({ changedFiles, prBody: process.env['PR_BODY'] ?? '' })
    console.log(result.message)
    if (!result.ok) process.exitCode = 1
  }
}
