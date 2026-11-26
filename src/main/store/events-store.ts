// 出来事と取り込みの記録の保存（events.json。ADR-009、component-backend.md 7.、domain-model.md 5.）。
// 守ること（AGENTS.md「特に守る範囲」）:
//   I-1 同じ出典（id）の出来事は1件に重ねる
//   I-4 発生から30日を過ぎた出来事は消す。一覧に出すのは出来事の一覧の日数以内
//   I-5 取り込みの記録は、出来事を保存し終えた後にだけ進める（同じ書き込みで行い、書けなければどちらも進めない）
import { rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { z } from 'zod'
import { GitHubEventSchema, IsoDateTimeSchema, type GitHubEvent } from '../../shared/domain'
import { DAY_MS, EVENT_RETENTION_DAYS } from '../core/constants'
import type { Logger } from '../log/logger'
import { readJsonFile, removeOldCorruptFiles, writeJsonFileAtomic } from './json-file'

/** スレッドごとの取り込みの記録（domain-model.md 5.） */
export const ThreadRecordSchema = z.strictObject({
  /** スレッドの最新の理由 */
  reason: z.string().min(1),
  /** スレッドの更新時刻（30日動きが無いかの判定に使う） */
  updatedAt: IsoDateTimeSchema,
  /** ここまで分解した（次は「この時刻 − 5分」以降を分解する） */
  expandedUntil: IsoDateTimeSchema,
  /** 参加中（一度 true になったら戻さない。domain-model.md 4.2） */
  participating: z.boolean(),
  /** 続けて失敗した回数（3回で記録を進める。component-backend.md 5.2） */
  consecutiveFailures: z.int().nonnegative(),
})
export type ThreadRecord = z.infer<typeof ThreadRecordSchema>

/** GitHub の通知の問い合わせの記録（domain-model.md 5.。ETag は CR-003） */
export const GitHubNotificationCursorSchema = z.strictObject({
  etag: z.string().min(1).optional(),
  lastSuccessAt: IsoDateTimeSchema.optional(),
})
export type GitHubNotificationCursor = z.infer<typeof GitHubNotificationCursorSchema>

export const EventsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  events: z.array(GitHubEventSchema),
  githubNotifications: GitHubNotificationCursorSchema,
  threads: z.record(z.string().min(1), ThreadRecordSchema),
})
type EventsFile = z.infer<typeof EventsFileSchema>

export interface EventsChange {
  events?: GitHubEvent[]
  /** 渡した項目だけを変える */
  githubNotifications?: GitHubNotificationCursor
  /** 渡したスレッドだけを置き換える。null なら消す */
  threads?: Record<string, ThreadRecord | null>
}

const empty = (): EventsFile => ({
  schemaVersion: 1,
  events: [],
  githubNotifications: {},
  threads: {},
})

/** I-4: 発生から30日を過ぎた出来事と、30日動きの無いスレッドの記録を除く */
function withoutExpired(file: EventsFile, now: Date): EventsFile {
  const oldest = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS).toISOString()
  return {
    ...file,
    events: file.events.filter((event) => event.occurredAt >= oldest),
    threads: Object.fromEntries(
      Object.entries(file.threads).filter(([, record]) => record.updatedAt >= oldest),
    ),
  }
}

export class EventsStore {
  private state: EventsFile = empty()
  /** 読み込みと書き込みを1つずつ順に行う（立ち上げの読み込みの前に書かない。書き込みどうしが重ならない） */
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

  /** 立ち上げ時に読む。壊れていたら退避して空から始め、recovered: true を返す（取り直しが要る。Q-09） */
  load(now: Date): Promise<{ recovered: boolean }> {
    return this.enqueue(async () => {
      const result = await readJsonFile(this.path, EventsFileSchema, now)
      await removeOldCorruptFiles(this.path, now)
      if (result.kind === 'corrupt') {
        this.logger.warn('store.corrupt', { file: basename(this.path) })
      }
      const loaded = result.kind === 'ok' ? result.value : empty()
      const kept = withoutExpired(loaded, now)
      if (
        kept.events.length !== loaded.events.length ||
        Object.keys(kept.threads).length !== Object.keys(loaded.threads).length
      ) {
        await writeJsonFileAtomic(this.path, kept)
      }
      this.state = kept
      return { recovered: result.kind === 'corrupt' }
    })
  }

  /**
   * 出来事と取り込みの記録を、同じ書き込みで保存する（I-5）。新しく増えた出来事（I-1 で重ならなかったもの）を返す。
   * 書けなければ例外になり、手元の状態も進めない。
   */
  commit(change: EventsChange, now: Date): Promise<GitHubEvent[]> {
    return this.enqueue(async () => {
      const known = new Set(this.state.events.map((event) => event.id))
      const added: GitHubEvent[] = []
      for (const event of change.events ?? []) {
        if (known.has(event.id)) continue
        known.add(event.id)
        added.push(event)
      }
      const threads = { ...this.state.threads }
      for (const [id, record] of Object.entries(change.threads ?? {})) {
        if (record === null) delete threads[id]
        else threads[id] = record
      }
      const next = withoutExpired(
        {
          schemaVersion: 1,
          events: [...this.state.events, ...added],
          githubNotifications: { ...this.state.githubNotifications, ...change.githubNotifications },
          threads,
        },
        now,
      )
      await writeJsonFileAtomic(this.path, next)
      this.state = next
      const kept = new Set(next.events.map((event) => event.id))
      return added.filter((event) => kept.has(event.id))
    })
  }

  /** 24時間ごとの削除（I-4）。消したものがあれば保存し直し、true を返す */
  purge(now: Date): Promise<boolean> {
    return this.enqueue(async () => {
      const next = withoutExpired(this.state, now)
      const changed =
        next.events.length !== this.state.events.length ||
        Object.keys(next.threads).length !== Object.keys(this.state.threads).length
      if (changed) {
        await writeJsonFileAtomic(this.path, next)
        this.state = next
      }
      return changed
    })
  }

  /** サインアウトで消す（auth-flow.md 6.） */
  clear(): Promise<void> {
    return this.enqueue(async () => {
      await rm(this.path, { force: true })
      this.state = empty()
    })
  }

  /** 出来事の一覧に出すもの: 出来事の一覧の日数以内、発生の新しい順（I-4、ipc-contract.md 2. の events:list） */
  listForDisplay(eventDays: number, now: Date): GitHubEvent[] {
    const oldest = new Date(now.getTime() - eventDays * DAY_MS).toISOString()
    return this.state.events
      .filter((event) => event.occurredAt >= oldest)
      .toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }

  githubNotificationCursor(): GitHubNotificationCursor {
    return { ...this.state.githubNotifications }
  }

  thread(id: string): ThreadRecord | undefined {
    const record = this.state.threads[id]
    return record === undefined ? undefined : { ...record }
  }
}
