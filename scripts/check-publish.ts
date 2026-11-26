// 公開前の見直しの機械で行う部分（security-rules.md 2. の #2〜#4）。
//   #2 禁止語リスト（.forbidden-words）の語が、コミットするファイルとコミットのメッセージに無い
//   #3 トークンの形の文字列が無い
//   #4 コミットの作成者・コミッターのメールアドレスが GitHub の noreply のもの
// 見つかった語そのものは出さない（禁止語リストの何行目か・どのファイルの何行目かだけを出す）。
//
// 使い方: node scripts/check-publish.ts
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const TOKEN = /\b(gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/
const NOREPLY = /@users\.noreply\.github\.com$/

function git(args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch {
    // コミットがまだ無いときなど
    return ''
  }
}

function matcher(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 英数字だけの語は、前後が英数字でないときだけ当てる（短い語が別の語の一部に当たらないように）
  return /^[\x20-\x7e]+$/.test(word)
    ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i')
    : new RegExp(escaped, 'i')
}

const problems: string[] = []

// #2 禁止語リスト
const words = existsSync('.forbidden-words')
  ? readFileSync('.forbidden-words', 'utf-8')
      .split('\n')
      .map((text, index) => ({ text: text.trim(), line: index + 1 }))
      .filter((word) => word.text !== '' && !word.text.startsWith('#'))
  : []
const files = git(['ls-files', '--cached', '--others', '--exclude-standard'])
  .split('\n')
  .filter((path) => path !== '' && existsSync(path))
const messages = git(['log', '--all', '--format=%H%n%B%n----'])

for (const word of words) {
  const pattern = matcher(word.text)
  for (const path of files) {
    readFileSync(path, 'utf-8')
      .split('\n')
      .forEach((text, index) => {
        if (pattern.test(text))
          problems.push(`#2 禁止語リスト ${word.line} 行目の語: ${path}:${index + 1}`)
      })
  }
  if (pattern.test(messages))
    problems.push(`#2 禁止語リスト ${word.line} 行目の語: コミットのメッセージ`)
}

// #3 トークンの形
for (const path of files) {
  readFileSync(path, 'utf-8')
    .split('\n')
    .forEach((text, index) => {
      if (TOKEN.test(text)) problems.push(`#3 トークンの形: ${path}:${index + 1}`)
    })
}
if (TOKEN.test(git(['log', '--all', '-p']))) problems.push('#3 トークンの形: コミットの履歴')

// #4 メールアドレス
const emails = new Set(
  git(['log', '--all', '--format=%ae%n%ce'])
    .split('\n')
    .filter((email) => email !== ''),
)
for (const email of emails) {
  if (!NOREPLY.test(email))
    problems.push(
      `#4 noreply でないメールアドレスのコミットがある（${email.replace(/^[^@]*/, '***')}）`,
    )
}
const configured = git(['config', 'user.email']).trim()
if (configured !== '' && !NOREPLY.test(configured))
  problems.push('#4 このリポジトリの user.email が noreply でない')

console.log(
  `禁止語リスト: ${existsSync('.forbidden-words') ? `${words.length} 語` : '無い（#2 は未）'}`,
)
console.log(
  `見たファイル: ${files.length} 件、コミット: ${emails.size === 0 ? 'まだ無い' : 'あり'}`,
)
if (problems.length === 0) {
  console.log('見つかったもの: 0 件')
} else {
  for (const problem of problems) console.log(problem)
  console.log(`見つかったもの: ${problems.length} 件`)
  process.exitCode = 1
}
