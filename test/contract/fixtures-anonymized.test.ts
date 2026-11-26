import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 記録した GitHub の応答に、架空の名前以外が入っていないか（security-rules.md S-10、test-conventions.md 3.）。
// 置き換えの道具（scripts/fixtures/anonymize.ts）の検査に加えて、CI でも毎回確かめる。
const DIR = 'test/fixtures/github'
const files = readdirSync(DIR).filter((name) => name.endsWith('.json'))

const PEOPLE = new Set([
  'alice',
  'bob',
  'carol',
  'dave',
  'erin',
  'frank',
  'grace',
  'heidi',
  'ivan',
  'judy',
  'mallory',
  'niaj',
  'olivia',
  'peggy',
  'rupert',
  'sybil',
  'trent',
  'victor',
  'walter',
])
const isFictionalLogin = (login: string) =>
  PEOPLE.has(login) ||
  /^example-org(-\d+)?$/.test(login) ||
  /^example-bot(-\d+)?(\[bot\])?$/.test(login) ||
  /^person-\d+$/.test(login)
const isFictionalOwner = (owner: string) =>
  owner === 'alice' || /^example-org(-\d+)?$/.test(owner) || isFictionalLogin(owner)

function walk(node: unknown, visit: (key: string, value: unknown) => void, key = ''): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, key)
  } else if (node !== null && typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node)) {
      visit(childKey, value)
      walk(value, visit, childKey)
    }
  }
}

describe.each(files)('%s', (file) => {
  const text = readFileSync(`${DIR}/${file}`, 'utf-8')
  const json = JSON.parse(text) as unknown

  it('request と response の形', () => {
    const recorded = json as { request?: { method?: unknown }; response?: { status?: unknown } }
    expect(typeof recorded.request?.method).toBe('string')
    expect(typeof recorded.response?.status).toBe('number')
  })

  it('ユーザー名は架空のものだけ', () => {
    const logins: string[] = []
    walk(json, (key, value) => {
      if (key === 'login' && typeof value === 'string') logins.push(value)
    })
    expect(logins.filter((login) => !isFictionalLogin(login))).toEqual([])
  })

  it('リポジトリは架空のものだけ', () => {
    const repositories: string[] = []
    walk(json, (key, value) => {
      if ((key === 'full_name' || key === 'nameWithOwner') && typeof value === 'string')
        repositories.push(value)
    })
    expect(repositories.filter((name) => !isFictionalOwner(name.split('/')[0] ?? ''))).toEqual([])
  })

  it('URL は GitHub か example.com のもので、持ち主は架空のものだけ', () => {
    const urls = [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map((match) => match[0])
    const bad = urls.filter((value) => {
      const url = new URL(value.replace(/\{[^}]*\}/g, ''))
      if (url.hostname === 'example.com' || url.hostname === 'avatars.githubusercontent.com')
        return false
      if (url.hostname !== 'github.com' && url.hostname !== 'api.github.com') return true
      const segments = url.pathname.split('/').filter((segment) => segment !== '')
      // github.com/{owner}/…、github.com/orgs/{owner}/…、api.github.com/repos/{owner}/… など
      const ownerIndex = ['repos', 'users', 'orgs'].includes(segments[0] ?? '')
        ? 1
        : url.hostname === 'github.com'
          ? 0
          : -1
      const owner = ownerIndex === -1 ? undefined : segments[ownerIndex]
      return owner !== undefined && !isFictionalOwner(owner)
    })
    expect(bad).toEqual([])
  })

  it('トークンの形の文字列が無い（security-rules.md S-01）', () => {
    expect(text).not.toMatch(/\b(gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/)
  })
})
