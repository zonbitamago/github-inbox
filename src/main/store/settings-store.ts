// 設定の保存（settings.json。ADR-009、component-backend.md 7.）。足りない項目は既定値で補う。
import { basename } from 'node:path'
import { z } from 'zod'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '../../shared/domain'
import type { Logger } from '../log/logger'
import { readJsonFile, removeOldCorruptFiles, writeJsonFileAtomic } from './json-file'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** 足りない項目を既定値で補う（前の版で保存したファイルなど）。知らない項目・範囲の外の値は、そのまま検査で断る */
function withDefaults(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const notification = raw['desktopNotification']
  const byType = isRecord(notification) ? notification['byType'] : undefined
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    desktopNotification: isRecord(notification)
      ? {
          ...DEFAULT_SETTINGS.desktopNotification,
          ...notification,
          byType: isRecord(byType)
            ? { ...DEFAULT_SETTINGS.desktopNotification.byType, ...byType }
            : (byType ?? DEFAULT_SETTINGS.desktopNotification.byType),
        }
      : (notification ?? DEFAULT_SETTINGS.desktopNotification),
  }
}

const StoredSettingsSchema = z.preprocess(withDefaults, SettingsSchema)

export class SettingsStore {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS)
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly logger: Logger,
  ) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task)
    this.queue = next.catch(() => undefined)
    return next
  }

  /** 読む。無ければ既定値（ファイルは変えたときに作る）。壊れていたら退避して既定値（Q-09） */
  load(now: Date): Promise<Settings> {
    return this.enqueue(async () => {
      const result = await readJsonFile(this.path, StoredSettingsSchema, now)
      await removeOldCorruptFiles(this.path, now)
      if (result.kind === 'corrupt') {
        this.logger.warn('store.corrupt', { file: basename(this.path) })
      }
      this.settings = result.kind === 'ok' ? result.value : structuredClone(DEFAULT_SETTINGS)
      return this.current()
    })
  }

  current(): Settings {
    return structuredClone(this.settings)
  }

  /** 一部を変えて保存する。画面からの変更は ipc の受け口で SettingsPatch として検査してから渡す */
  update(patch: Partial<Settings>): Promise<Settings> {
    return this.enqueue(async () => {
      const next = SettingsSchema.parse({ ...this.settings, ...patch })
      await writeJsonFileAtomic(this.path, next)
      this.settings = next
      return this.current()
    })
  }
}
