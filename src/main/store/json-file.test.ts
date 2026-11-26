import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readJsonFile, removeOldCorruptFiles, writeJsonFileAtomic } from './json-file'

const Schema = z.strictObject({ schemaVersion: z.literal(1), value: z.string() })
const NOW = new Date('2026-01-02T03:04:05.678Z')

let dir: string
let file: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-store-'))
  file = join(dir, 'data.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// ADR-009、component-backend.md 7.
describe('JSON のファイル', () => {
  it('書いて読める。一時ファイルは残らない', async () => {
    await writeJsonFileAtomic(file, { schemaVersion: 1, value: 'a' })
    expect(await readJsonFile(file, Schema, NOW)).toEqual({
      kind: 'ok',
      value: { schemaVersion: 1, value: 'a' },
    })
    expect(await readdir(dir)).toEqual(['data.json'])
  })

  it('上書きしても読める', async () => {
    await writeJsonFileAtomic(file, { schemaVersion: 1, value: 'a' })
    await writeJsonFileAtomic(file, { schemaVersion: 1, value: 'b' })
    expect(await readJsonFile(file, Schema, NOW)).toEqual({
      kind: 'ok',
      value: { schemaVersion: 1, value: 'b' },
    })
  })

  it('書く途中で失敗しても、前のファイルが残り、一時ファイルも残らない', async () => {
    await writeJsonFileAtomic(file, { schemaVersion: 1, value: 'a' })
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    await expect(writeJsonFileAtomic(file, circular)).rejects.toThrow()
    expect(await readJsonFile(file, Schema, NOW)).toEqual({
      kind: 'ok',
      value: { schemaVersion: 1, value: 'a' },
    })
    expect(await readdir(dir)).toEqual(['data.json'])
  })

  it('無ければ missing', async () => {
    expect(await readJsonFile(file, Schema, NOW)).toEqual({ kind: 'missing' })
  })

  it.each([
    ['JSON として読めない', '{ "schemaVersion": 1, '],
    ['形が合わない', JSON.stringify({ schemaVersion: 1, value: 1 })],
    ['版が違う', JSON.stringify({ schemaVersion: 2, value: 'a' })],
    ['余分な項目がある', JSON.stringify({ schemaVersion: 1, value: 'a', extra: true })],
  ])('%s → 退避して corrupt（Q-09）', async (_name, text) => {
    await writeFile(file, text)
    const result = await readJsonFile(file, Schema, NOW)
    expect(result).toEqual({
      kind: 'corrupt',
      movedTo: join(dir, 'data.json.corrupt-2026-01-02T03-04-05-678Z'),
    })
    expect(await readdir(dir)).toEqual(['data.json.corrupt-2026-01-02T03-04-05-678Z'])
    expect(await readFile(join(dir, 'data.json.corrupt-2026-01-02T03-04-05-678Z'), 'utf-8')).toBe(
      text,
    )
  })

  it('退避したファイルは7日で消す。ほかのファイルは消さない', async () => {
    for (const name of [
      'data.json',
      'data.json.corrupt-2025-12-25T00-00-00-000Z',
      'data.json.corrupt-2025-12-27T00-00-00-000Z',
      'other.json.corrupt-2025-12-01T00-00-00-000Z',
    ]) {
      await writeFile(join(dir, name), '')
    }
    expect(await removeOldCorruptFiles(file, NOW)).toBe(1)
    expect((await readdir(dir)).toSorted()).toEqual([
      'data.json',
      'data.json.corrupt-2025-12-27T00-00-00-000Z',
      'other.json.corrupt-2025-12-01T00-00-00-000Z',
    ])
  })
})
