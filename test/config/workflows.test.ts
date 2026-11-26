import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// GitHub Actions の決まり（security-rules.md S-12）。YAML の部品は入れず、行で調べる（部品を足さない。coding-standards.md 1.）。

const DIR = '.github/workflows'
const workflows = readdirSync(DIR)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, lines: readFileSync(join(DIR, name), 'utf-8').split('\n') }))

/** Releases に置くジョブを持つワークフロー（`contents: write` を許す）。S7 で作るときにここに足す */
const RELEASE_WORKFLOWS = new Set<string>([])

const code = (line: string) => line.replace(/\s+#.*$/, '')

describe('GitHub Actions（security-rules.md S-12）', () => {
  it('ワークフローがある', () => {
    expect(workflows.length).toBeGreaterThan(0)
  })

  it.each(workflows)('$name: 最上位の permissions が contents: read', ({ lines }) => {
    const top = lines.findIndex((line) => /^permissions:/.test(line))
    expect(top).toBeGreaterThan(-1)
    expect(lines[top + 1]?.trim()).toBe('contents: read')
  })

  it.each(workflows)(
    '$name: 書き込みの権限は Releases のワークフローの contents: write だけ',
    ({ name, lines }) => {
      const writes = lines.map(code).filter((line) => /:\s*write(?:-all)?\s*$|write-all/.test(line))
      const allowed = RELEASE_WORKFLOWS.has(name) ? ['contents: write'] : []
      expect(writes.map((line) => line.trim()).filter((line) => !allowed.includes(line))).toEqual(
        [],
      )
    },
  )

  it.each(workflows)('$name: Action はコミットの SHA で固定する', ({ lines }) => {
    const unpinned = lines
      .map(code)
      .filter((line) => /^\s*-?\s*uses:/.test(line))
      .filter((line) => !/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(line.trim()))
    expect(unpinned).toEqual([])
  })

  it.each(workflows)(
    '$name: 秘密の値は GITHUB_TOKEN だけ、pull_request_target を使わない',
    ({ lines }) => {
      const text = lines.map(code).join('\n')
      const secrets = [...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])
      expect(secrets.filter((secret) => secret !== 'GITHUB_TOKEN')).toEqual([])
      expect(text).not.toMatch(/pull_request_target/)
    },
  )
})
