import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { SettingsStore } from './settings-store'

const NOW = new Date('2026-01-31T00:00:00.000Z')
let dir: string
let path: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-settings-'))
  path = join(dir, 'settings.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('設定の保存（component-backend.md 7.）', () => {
  it('無ければ既定値（ファイルはまだ作らない）', async () => {
    const store = new SettingsStore(path, createMemoryLogger())
    expect(await store.load(NOW)).toEqual(DEFAULT_SETTINGS)
    expect(await readdir(dir)).toEqual([])
  })

  it('一部だけ変えて保存し、次に読める', async () => {
    const store = new SettingsStore(path, createMemoryLogger())
    await store.load(NOW)
    const updated = await store.update({ prPeriodDays: 14, layout: 'side_by_side' })
    expect(updated).toEqual({ ...DEFAULT_SETTINGS, prPeriodDays: 14, layout: 'side_by_side' })
    expect(await new SettingsStore(path, createMemoryLogger()).load(NOW)).toEqual(updated)
  })

  it('画面から変えられない項目（使い始めの案内を終えた時刻・前に立ち上げた版）も、メインからは変えられる', async () => {
    const store = new SettingsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.update({
      onboarding: { completedAt: NOW.toISOString() },
      lastLaunchedVersion: '0.1.0',
    })
    expect(store.current()).toMatchObject({
      onboarding: { completedAt: NOW.toISOString() },
      lastLaunchedVersion: '0.1.0',
    })
  })

  it('足りない項目は既定値で補う（前の版で保存したファイルなど）', async () => {
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, prPeriodDays: 3, desktopNotification: { bots: false } }),
    )
    const store = new SettingsStore(path, createMemoryLogger())
    expect(await store.load(NOW)).toEqual({
      ...DEFAULT_SETTINGS,
      prPeriodDays: 3,
      desktopNotification: { ...DEFAULT_SETTINGS.desktopNotification, bots: false },
    })
  })

  it('画面の配色を持たない前の版のファイルは、OS に合わせる（CR-012）', async () => {
    await writeFile(path, JSON.stringify({ ...DEFAULT_SETTINGS, appearance: undefined }))
    const store = new SettingsStore(path, createMemoryLogger())
    expect((await store.load(NOW)).appearance).toBe('system')
  })

  it('知らない項目は捨てて読み、ほかの設定と使い始めた記録は残す（新しい版で保存したファイル。CR-013）', async () => {
    const completedAt = NOW.toISOString()
    await writeFile(
      path,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        language: 'en',
        futureSetting: 'x',
        desktopNotification: {
          ...DEFAULT_SETTINGS.desktopNotification,
          byType: { ...DEFAULT_SETTINGS.desktopNotification.byType, future_type: false },
          futureOption: true,
        },
        onboarding: { completedAt, futureStep: 1 },
      }),
    )
    const logger = createMemoryLogger()
    const store = new SettingsStore(path, logger)

    expect(await store.load(NOW)).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
      onboarding: { completedAt },
    })
    expect(await readdir(dir)).toEqual(['settings.json'])
    expect(logger.entries).toEqual([
      {
        level: 'warn',
        kind: 'store.unknown_keys_dropped',
        fields: { file: 'settings.json', count: 4 },
      },
    ])
  })

  it.each([
    ['JSON として読めない', '{ broken'],
    ['日数が範囲の外', JSON.stringify({ schemaVersion: 1, prPeriodDays: 99 })],
    [
      '知らない区分値（新しい版で増えた画面の配色など）',
      JSON.stringify({ schemaVersion: 1, appearance: 'high_contrast' }),
    ],
    ['版が違う', JSON.stringify({ schemaVersion: 2 })],
    ['オブジェクトでない', JSON.stringify([1, 2])],
  ])('%s → 退避して既定値（Q-09）', async (_name, text) => {
    await writeFile(path, text)
    const logger = createMemoryLogger()
    const store = new SettingsStore(path, logger)
    expect(await store.load(NOW)).toEqual(DEFAULT_SETTINGS)
    expect((await readdir(dir)).some((name) => name.startsWith('settings.json.corrupt-'))).toBe(
      true,
    )
    expect(logger.entries).toEqual([
      { level: 'warn', kind: 'store.corrupt', fields: { file: 'settings.json' } },
    ])
  })

  it('保存したファイルは、検査に通る形', async () => {
    const store = new SettingsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.update({ language: 'en' })
    expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
    })
  })
})
