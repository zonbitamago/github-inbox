// 文書（Markdown）の表から値を読む、テストのための小さな道具。
// 契約の文書とコードの食い違いを機械で拾うために使う（build-plan.md 6.）。
import { readFileSync } from 'node:fs'

export function readDoc(path: string): string {
  return readFileSync(path, 'utf-8')
}

/** 見出し（例: "## 2." や "### 2.1"）から、次の同じ深さ以上の見出しまでを切り出す */
export function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${heading} `))
  if (start === -1) {
    throw new Error(`見出しが無い: ${heading}`)
  }
  const level = /^#+/.exec(heading)?.[0].length ?? 0
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => {
    const match = /^(#+) /.exec(line)
    return match !== null && (match[1]?.length ?? 0) <= level
  })
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** 表の行（見出しと区切りを除く）を、セルの配列で返す */
export function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells, index) => index > 0 && !cells.every((cell) => /^:?-+:?$/.test(cell)))
}

/** セルの中の `...` を全部取り出す */
export function codesIn(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '')
}
