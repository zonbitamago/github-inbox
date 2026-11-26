import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 配布物の画面の CSP（security-rules.md S-04）。開発中の緩め方は electron.vite.config.ts。
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

describe('画面の CSP', () => {
  it('index.html の meta が security-rules.md S-04 のとおり', () => {
    const html = readFileSync('src/renderer/index.html', 'utf-8')
    const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)
    expect(match?.[1]).toBe(EXPECTED_CSP)
  })
})
