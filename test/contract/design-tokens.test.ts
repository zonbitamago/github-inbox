import { describe, expect, it } from 'vitest'
import { readDoc } from '../support/markdown'

// design-system.md のトークンが、tokens.css に過不足なくあるか（build-plan.md 3.1 B4）
const designSystem = readDoc('docs/design/conventions/design-system.md')
const css = readDoc('src/renderer/styles/tokens.css')

const TOKEN = /^(color|font|space|radius|shadow)-[a-z0-9-]+$/

function documentedTokens(): string[] {
  const names = new Set<string>()
  for (const match of designSystem.matchAll(/`([a-z0-9-]+)`/g)) {
    const name = match[1] ?? ''
    if (TOKEN.test(name)) {
      names.add(name)
    }
  }
  // 文書の「color-badge-neutral-bg・color-badge-neutral-fg」のような書き方もそのまま拾える
  return [...names].toSorted()
}

function definedTokens(block: string): string[] {
  return [...new Set([...block.matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1] ?? ''))]
    .filter((name) => TOKEN.test(name))
    .toSorted()
}

const [lightBlock = '', darkBlock = ''] = css.split('@media (prefers-color-scheme: dark)')

describe('デザイントークン', () => {
  it('design-system.md のトークンが全部、ライトで定義されている（余分も無い）', () => {
    expect(definedTokens(lightBlock)).toEqual(documentedTokens())
  })

  it('色のトークンは、ダークでも全部定義されている', () => {
    const colors = documentedTokens().filter((name) => name.startsWith('color-'))
    expect(definedTokens(darkBlock).filter((name) => name.startsWith('color-'))).toEqual(colors)
  })

  it('部品で使う名前の形（{種別}-{意味}）に合わない変数を作っていない', () => {
    const all = [...css.matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1] ?? '')
    expect(all.filter((name) => !TOKEN.test(name))).toEqual([])
  })
})
