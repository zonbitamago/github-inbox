import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogger } from './logger'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-log-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const at = (iso: string) => () => new Date(iso)

async function lines(name: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(join(dir, name), 'utf-8')
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

// non-functional.md Q-15・security-rules.md S-09
describe('ログ', () => {
  it('1行1件の JSON で、その日（UTC）のファイルに足していく', async () => {
    const logger = createLogger({ dir, now: at('2026-01-02T03:04:05.000Z') })
    logger.info('github.request', { endpoint: 'notifications', status: 200, ms: 120 })
    logger.warn('store.corrupt', { file: 'events.json' })
    await logger.flush()
    expect(await lines('2026-01-02.log')).toEqual([
      {
        at: '2026-01-02T03:04:05.000Z',
        level: 'info',
        kind: 'github.request',
        endpoint: 'notifications',
        status: 200,
        ms: 120,
      },
      { at: '2026-01-02T03:04:05.000Z', level: 'warn', kind: 'store.corrupt', file: 'events.json' },
    ])
  })

  it('日が変わったら、次のファイルに書く', async () => {
    let now = '2026-01-02T23:59:59.000Z'
    const logger = createLogger({ dir, now: () => new Date(now) })
    logger.info('a')
    now = '2026-01-03T00:00:00.000Z'
    logger.error('b')
    await logger.flush()
    expect((await readdir(dir)).toSorted()).toEqual(['2026-01-02.log', '2026-01-03.log'])
  })

  it.each([
    ['ghp_', 'ghp_' + 'a'.repeat(36)],
    ['gho_', 'gho_' + 'B'.repeat(36)],
    ['ghs_', 'ghs_' + '1'.repeat(36)],
    ['ghu_', 'ghu_' + 'c'.repeat(36)],
    ['github_pat_', 'github_pat_' + 'd'.repeat(30) + '_' + 'e'.repeat(20)],
  ])('S-09: トークンの形（%s）は書く前に消す', async (_name, token) => {
    const logger = createLogger({ dir, now: at('2026-01-02T00:00:00.000Z') })
    logger.error('github.error', { message: `Bad credentials for ${token} please retry` })
    await logger.flush()
    const text = await readFile(join(dir, '2026-01-02.log'), 'utf-8')
    expect(text).not.toContain(token)
    expect(text).toContain('[REDACTED]')
  })

  it('7日より前のファイルを消し、ログ以外のファイルは消さない', async () => {
    for (const name of ['2025-12-25.log', '2025-12-26.log', '2026-01-01.log', 'memo.txt']) {
      await writeFile(join(dir, name), '')
    }
    const logger = createLogger({ dir, now: at('2026-01-02T12:00:00.000Z') })
    expect(await logger.removeOldFiles()).toBe(1)
    expect((await readdir(dir)).toSorted()).toEqual([
      '2025-12-26.log',
      '2026-01-01.log',
      'memo.txt',
    ])
  })

  it('フォルダが無ければ作る', async () => {
    const nested = join(dir, 'logs')
    const logger = createLogger({ dir: nested, now: at('2026-01-02T00:00:00.000Z') })
    logger.info('a')
    await logger.flush()
    expect(await readdir(nested)).toEqual(['2026-01-02.log'])
    expect(await logger.removeOldFiles()).toBe(0)
  })

  it('書けなかったときは、失敗の数を数える（何もしないで捨てない）', async () => {
    const logger = createLogger({
      dir: join(dir, 'file-not-dir'),
      now: at('2026-01-02T00:00:00.000Z'),
    })
    await writeFile(join(dir, 'file-not-dir'), '')
    logger.info('a')
    await logger.flush()
    expect(logger.failures()).toBe(1)
  })

  it('ログのフォルダが無いときに古いファイルを消そうとしても、失敗しない', async () => {
    const logger = createLogger({ dir: join(dir, 'missing'), now: at('2026-01-02T00:00:00.000Z') })
    expect(await logger.removeOldFiles()).toBe(0)
  })
})
