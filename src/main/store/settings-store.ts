// 設定の保存（settings.json。ADR-009、component-backend.md 7.）。足りない項目は既定値で補い、知らない項目は捨てる。
import { basename } from 'node:path'
import { z } from 'zod'
import {
  DEFAULT_SETTINGS,
  DesktopNotificationSettingsSchema,
  EVENT_TYPES,
  SettingsSchema,
  type Settings,
} from '../../shared/domain'
import type { Logger } from '../log/logger'
import { readJsonFile, removeOldCorruptFiles, writeJsonFileAtomic } from './json-file'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const SETTINGS_KEYS = Object.keys(SettingsSchema.shape)
const DESKTOP_NOTIFICATION_KEYS = Object.keys(DesktopNotificationSettingsSchema.shape)
const ONBOARDING_KEYS = Object.keys(SettingsSchema.shape.onboarding.shape)

/** 知っている項目だけを残す。捨てた数を drop に知らせる */
function knownOnly(
  record: Record<string, unknown>,
  known: readonly string[],
  drop: () => void,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (known.includes(key)) kept[key] = value
    else drop()
  }
  return kept
}

/**
 * 読んだ設定を、検査できる形にそろえる。
 * - 知らない項目は捨てる（新しい版で保存したファイルを古い版で読むとき。CR-013）
 * - 足りない項目は既定値で補う（前の版で保存したファイルなど）
 * 範囲の外の値・知らない区分値は、そのまま検査で断る
 */
function normalize(raw: unknown, drop: () => void): unknown {
  if (!isRecord(raw)) return raw
  const settings = knownOnly(raw, SETTINGS_KEYS, drop)
  const desktopNotification = isRecord(settings['desktopNotification'])
    ? knownOnly(settings['desktopNotification'], DESKTOP_NOTIFICATION_KEYS, drop)
    : settings['desktopNotification']
  const byType = isRecord(desktopNotification) ? desktopNotification['byType'] : undefined
  const onboarding = settings['onboarding']
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    desktopNotification: isRecord(desktopNotification)
      ? {
          ...DEFAULT_SETTINGS.desktopNotification,
          ...desktopNotification,
          byType: isRecord(byType)
            ? {
                ...DEFAULT_SETTINGS.desktopNotification.byType,
                ...knownOnly(byType, EVENT_TYPES, drop),
              }
            : (byType ?? DEFAULT_SETTINGS.desktopNotification.byType),
        }
      : (desktopNotification ?? DEFAULT_SETTINGS.desktopNotification),
    onboarding: isRecord(onboarding)
      ? knownOnly(onboarding, ONBOARDING_KEYS, drop)
      : (onboarding ?? DEFAULT_SETTINGS.onboarding),
  }
}

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
      let dropped = 0
      const schema = z.preprocess(
        (raw) =>
          normalize(raw, () => {
            dropped += 1
          }),
        SettingsSchema,
      )
      const result = await readJsonFile(this.path, schema, now)
      await removeOldCorruptFiles(this.path, now)
      if (result.kind === 'corrupt') {
        this.logger.warn('store.corrupt', { file: basename(this.path) })
      } else if (result.kind === 'ok' && dropped > 0) {
        // 項目の名前と値は書かない
        this.logger.warn('store.unknown_keys_dropped', {
          file: basename(this.path),
          count: dropped,
        })
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
