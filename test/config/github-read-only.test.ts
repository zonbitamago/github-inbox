import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// security-rules.md S-07: GitHub に書き込む呼び出しが無いことを確かめる（N-06、coding-standards.md 9.。⑭ S2 から）。
// GitHub につなぐのは src/main/github/ だけ（fetch を他で使うことは ESLint が止める）。その中で:
//   1. fetch を呼ぶのは client.ts だけ（ほかのファイルは client を通す）
//   2. HTTP の method は GET だけ。POST は GraphQL のために client.ts だけに許す（S3 で使う）
//   3. GraphQL の mutation を書かない
// 決まりを変えるときは技術者に聞き、PR の本文で申告する（build-plan.md 6.3）。

const GITHUB_DIR = 'src/main/github'
const CLIENT = 'client.ts'

interface Source {
  /** GITHUB_DIR からの位置 */
  path: string
  text: string
}

const FETCH_CALL = /\bfetch\(/g
const METHOD = /\bmethod:\s*['"`](\w+)['"`]/g
/** `mutation {`・`mutation Name(` など。コメントの「mutation を書かない」は当たらない */
const MUTATION = /\bmutation\s*(?:\w+\s*)?[({]/

export function findWriteCalls(sources: Source[]): string[] {
  const violations: string[] = []
  for (const { path, text } of sources) {
    if (path !== CLIENT && FETCH_CALL.test(text))
      violations.push(`${path}: fetch は client.ts だけ`)
    FETCH_CALL.lastIndex = 0
    for (const match of text.matchAll(METHOD)) {
      const method = match[1]
      if (method === 'GET') continue
      if (method === 'POST' && path === CLIENT) continue
      violations.push(`${path}: method ${String(method)}`)
    }
    if (MUTATION.test(text)) violations.push(`${path}: GraphQL の mutation`)
  }
  return violations
}

function githubSources(): Source[] {
  return readdirSync(GITHUB_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .filter((path) => statSync(join(GITHUB_DIR, path)).isFile())
    .map((path) => ({ path, text: readFileSync(join(GITHUB_DIR, path), 'utf-8') }))
}

describe('GitHub に書き込む呼び出しが無い（security-rules.md S-07）', () => {
  it('src/main/github/ に、GET 以外の REST の呼び出しと GraphQL の mutation が無い', () => {
    const sources = githubSources()
    expect(sources.map((source) => source.path)).toContain(CLIENT)
    expect(findWriteCalls(sources)).toEqual([])
  })
})

describe('決まりが効いていること（架空のコードで確かめる）', () => {
  it.each([
    ['PUT', { path: CLIENT, text: "send(url, { method: 'PUT' })" }],
    ['DELETE', { path: CLIENT, text: 'send(url, { method: "DELETE" })' }],
    ['PATCH', { path: 'timeline.ts', text: "{ method: 'PATCH' }" }],
    ['client.ts の外の POST', { path: 'timeline.ts', text: "{ method: 'POST' }" }],
    ['client.ts の外の fetch', { path: 'notifications.ts', text: 'await fetch(url)' }],
    [
      'mutation',
      { path: 'timeline.ts', text: 'const query = `mutation { markNotificationsAsRead }`' },
    ],
    ['名前の付いた mutation', { path: 'timeline.ts', text: 'mutation MarkRead($id: ID!) {' }],
  ])('%s を見つける', (_name, source) => {
    expect(findWriteCalls([source])).toHaveLength(1)
  })

  it.each([
    ['GET', { path: CLIENT, text: "await send(url, { method: 'GET' })" }],
    ['client.ts の POST（GraphQL）', { path: CLIENT, text: "{ method: 'POST' }" }],
    ['client.ts の fetch', { path: CLIENT, text: 'fetch(input, init)' }],
    [
      'コメントの mutation',
      { path: 'client.ts', text: '// GraphQL は query だけで、mutation は書かない' },
    ],
    ['query', { path: 'timeline.ts', text: 'query Expand($since: DateTime!) {' }],
  ])('%s は通す', (_name, source) => {
    expect(findWriteCalls([source])).toEqual([])
  })
})
