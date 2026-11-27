import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeSecretCipher as fakeCipher } from '../../../test/support/fake-secret-cipher'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { TokenStore } from './token-store'

const TOKEN = 'test-token-not-real'

let dir: string
let path: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-token-'))
  path = join(dir, 'token.bin')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('トークンの保存（auth-flow.md 4.、N-05）', () => {
  it('暗号化して保存し、読み出せる。ファイルに平文は残らない', async () => {
    const store = new TokenStore(path, fakeCipher(), createMemoryLogger())
    await expect(store.save(TOKEN)).resolves.toBe('saved')
    await expect(store.exists()).resolves.toBe(true)
    expect((await readFile(path)).toString()).not.toContain(TOKEN)
    await expect(store.load()).resolves.toEqual({ kind: 'ok', token: TOKEN })
  })

  it.skipIf(process.platform === 'win32')('ファイルは持ち主だけが読み書きできる', async () => {
    const store = new TokenStore(path, fakeCipher(), createMemoryLogger())
    await store.save(TOKEN)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('OS の安全な保管場所が使えなければ、保存しない（平文で置かない）', async () => {
    const cipher = fakeCipher()
    cipher.available = false
    const store = new TokenStore(path, cipher, createMemoryLogger())
    await expect(store.save(TOKEN)).resolves.toBe('encryption_unavailable')
    await expect(store.exists()).resolves.toBe(false)
  })

  it('保存し直すと、前のトークンを置き換える', async () => {
    const store = new TokenStore(path, fakeCipher(), createMemoryLogger())
    await store.save('first-token-not-real')
    await store.save(TOKEN)
    await expect(store.load()).resolves.toEqual({ kind: 'ok', token: TOKEN })
  })
})

describe('トークンの読み出し（auth-flow.md 4.）', () => {
  it('ファイルが無ければ、無いとする', async () => {
    const store = new TokenStore(path, fakeCipher(), createMemoryLogger())
    await expect(store.exists()).resolves.toBe(false)
    await expect(store.load()).resolves.toEqual({ kind: 'missing' })
  })

  it('復号できなければ（キーチェーンで断られたなど）、読めないとし、ファイルは消さない', async () => {
    await writeFile(path, 'broken')
    const logger = createMemoryLogger()
    const store = new TokenStore(
      path,
      fakeCipher({ decrypt: () => Promise.reject(new Error('denied')) }),
      logger,
    )
    await expect(store.load()).resolves.toEqual({ kind: 'unreadable' })
    await expect(store.exists()).resolves.toBe(true)
    expect(logger.entries).toEqual([
      { level: 'warn', kind: 'auth.token_unreadable', fields: { error: 'Error' } },
    ])
  })

  it('鍵が替わって「暗号化し直すべき」と返されたら、暗号化し直して保存する', async () => {
    const cipher = fakeCipher()
    const store = new TokenStore(path, cipher, createMemoryLogger())
    await store.save(TOKEN)
    cipher.generation = 2
    await expect(store.load()).resolves.toEqual({ kind: 'ok', token: TOKEN })
    expect((await readFile(path)).toString().startsWith('2:')).toBe(true)
  })

  it('暗号化し直せなくても、読み出したトークンは使う（ログに残す）', async () => {
    const cipher = fakeCipher()
    const logger = createMemoryLogger()
    const store = new TokenStore(path, cipher, logger)
    await store.save(TOKEN)
    cipher.generation = 2
    cipher.encrypt = () => Promise.reject(new Error('failed'))
    await expect(store.load()).resolves.toEqual({ kind: 'ok', token: TOKEN })
    expect(logger.entries).toEqual([
      { level: 'warn', kind: 'auth.token_reencrypt_failed', fields: { error: 'Error' } },
    ])
  })
})

describe('トークンを消す（auth-flow.md 6.）', () => {
  it('ファイルを消す。無くても失敗しない', async () => {
    const store = new TokenStore(path, fakeCipher(), createMemoryLogger())
    await store.save(TOKEN)
    await store.remove()
    await expect(store.exists()).resolves.toBe(false)
    await expect(store.remove()).resolves.toBeUndefined()
  })
})
