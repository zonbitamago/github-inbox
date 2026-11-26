import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// coding-standards.md の決まりのうち、ESLint では見られないものを確かめる（coding-standards.md 9.）。
// 決まりを変えるときは技術者に聞き、PR の本文で申告する（build-plan.md 6.3）。

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .map((path) => join(dir, path))
    .filter((path) => statSync(path).isFile())
}

const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*'
const PASCAL = '[A-Z][A-Za-z0-9]*'

/** coding-standards.md 3.: ファイル名は kebab-case、React の部品は PascalCase */
const FILE_NAME_PATTERNS = [
  new RegExp(`^${KEBAB}(?:\\.test|\\.d)?\\.ts$`),
  new RegExp(`^(?:${PASCAL}|${KEBAB})(?:\\.test)?\\.tsx$`),
  new RegExp(`^(?:${PASCAL}|${KEBAB})(?:\\.module)?\\.css$`),
  new RegExp(`^${KEBAB}\\.html$`),
  /^CLAUDE\.md$/,
]

describe('名前（coding-standards.md 3.）', () => {
  it('src/ のファイル名とフォルダ名が決まりの形', () => {
    const violations = filesUnder('src').filter((path) => {
      const folders = path.split('/').slice(1, -1)
      return (
        !folders.every((name) => new RegExp(`^${KEBAB}$`).test(name)) ||
        !FILE_NAME_PATTERNS.some((pattern) => pattern.test(basename(path)))
      )
    })
    expect(violations).toEqual([])
  })
})

/** 色の値（16進・色の関数） */
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/
/** 余白・大きさの値（px・rem・em・pt）。0・%・画面の大きさに対する値（100vh など）は配置の値なので見ない */
const LENGTH = /(?<![\w.-])\d*\.?\d+(?:px|rem|em|pt)\b/g
/** 罫線とフォーカスの輪の太さだけは、design-system.md 5. の文章どおり 1px・2px を書いてよい */
const LINE_PROPERTY = /^(?:border|outline)/
const LINE_WIDTHS = new Set(['1px', '2px'])

function cssViolations(path: string, text: string): string[] {
  const found: string[] = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\/\*.*?\*\//g, '').trim()
    // セレクター（`a:hover {` など）と、CSS の変数を使えない @media の行は見ない
    if (line.endsWith('{') || line.endsWith(',') || line.startsWith('@media')) return
    const declaration = /^([a-z-]+)\s*:\s*(.+?);?$/.exec(line)
    if (declaration === null) return
    const [, property = '', value = ''] = declaration
    if (COLOR.test(value)) found.push(`${path}:${index + 1} 色 ${line}`)
    for (const [length] of value.matchAll(LENGTH)) {
      if (LINE_PROPERTY.test(property) && LINE_WIDTHS.has(length)) continue
      found.push(`${path}:${index + 1} 長さ ${line}`)
    }
  })
  return found
}

describe('見た目の値（coding-standards.md 7.、design-system.md 5.）', () => {
  it('画面の CSS は色・大きさを直接書かず、トークン（CSS の変数）だけを使う', () => {
    const files = filesUnder('src/renderer').filter(
      (path) => path.endsWith('.css') && path !== 'src/renderer/styles/tokens.css',
    )
    expect(files.length).toBeGreaterThan(0)
    expect(files.flatMap((path) => cssViolations(path, readFileSync(path, 'utf-8')))).toEqual([])
  })

  it('検査は色と長さを見つけ、罫線の 1px は通す（検査そのものの確かめ）', () => {
    const sample = [
      '.a:hover,',
      '.b {',
      '  color: #fff;',
      '  padding: 8px var(--space-2);',
      '  border-bottom: 1px solid var(--color-border);',
      '  gap: 0;',
      '}',
    ].join('\n')
    expect(cssViolations('sample.css', sample)).toEqual([
      'sample.css:3 色 color: #fff;',
      'sample.css:4 長さ padding: 8px var(--space-2);',
    ])
  })
})

/** ESLint の無効化のコメント。決まりの名前と、`--` の後の理由が要る */
const DISABLE_COMMENT = /^\s*(?:\/\/|\/\*)\s*eslint-disable/
const DISABLE_WITH_REASON =
  /eslint-disable(?:-next-line|-line)?\s+[@\w/-]+(?:\s*,\s*[@\w/-]+)*\s+--\s+\S/

describe('例外の書き方（coding-standards.md 4.）', () => {
  it('ESLint を無効にするコメントには、決まりの名前と理由（-- の後）を書く', () => {
    const files = [...filesUnder('src'), ...filesUnder('test'), ...filesUnder('scripts')].filter(
      (path) => /\.(?:ts|tsx|mjs)$/.test(path),
    )
    const violations = files.flatMap((path) =>
      readFileSync(path, 'utf-8')
        .split('\n')
        .flatMap((line, index) =>
          DISABLE_COMMENT.test(line) && !DISABLE_WITH_REASON.test(line)
            ? [`${path}:${index + 1}`]
            : [],
        ),
    )
    expect(violations).toEqual([])
  })
})

describe('秘密の値（security-rules.md S-16）', () => {
  it('コードに client secret を置かない', () => {
    const violations = filesUnder('src').filter((path) =>
      /client_?secret/i.test(readFileSync(path, 'utf-8')),
    )
    expect(violations).toEqual([])
  })
})
