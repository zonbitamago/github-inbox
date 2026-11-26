import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// npm の部品を足すときは先に技術者に聞く（coding-standards.md 1.、AGENTS.md 行動ルール 9）。
// 入れてよい部品は build-plan.md 10. の表にあるものだけ。表を直さずに部品を足すと、ここで落ちる。

const PackageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
})

function allowedPackages(): Set<string> {
  const plan = readFileSync('docs/build/build-plan.md', 'utf-8')
  const start = plan.indexOf('\n## 10.')
  const end = plan.indexOf('\n## ', start + 1)
  expect(start).toBeGreaterThan(-1)
  const rows = plan
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
  // 表の1列目に `名前` で並べてある
  return new Set(
    rows.flatMap((row) =>
      [...(row.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ''),
    ),
  )
}

describe('npm の部品（build-plan.md 10.）', () => {
  it('package.json の部品は、どれも build-plan.md 10. の表にある', () => {
    const pkg = PackageJsonSchema.parse(JSON.parse(readFileSync('package.json', 'utf-8')))
    const installed = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]
    const allowed = allowedPackages()
    expect(allowed.size).toBeGreaterThan(0)
    expect(installed.filter((name) => !allowed.has(name))).toEqual([])
  })
})
