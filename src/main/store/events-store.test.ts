import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import type { GitHubEvent } from '../../shared/domain'
import { EventsStore } from './events-store'

const NOW = new Date('2026-01-31T00:00:00.000Z')
const daysBefore = (days: number, extraMs = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 - extraMs).toISOString()

function event(id: string, occurredAt: string, change: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    id,
    type: 'comment',
    target: {
      kind: 'pull_request',
      repository: 'example-org/app',
      number: 101,
      title: 'ログイン画面の文言を直す',
      url: 'https://github.com/example-org/app/pull/101',
    },
    actor: { login: 'bob', isBot: false },
    occurredAt,
    url: `https://github.com/example-org/app/pull/101#${id}`,
    receivedAt: NOW.toISOString(),
    ...change,
  }
}

const thread = (updatedAt: string) => ({
  reason: 'mention',
  updatedAt,
  expandedUntil: updatedAt,
  participating: false,
  consecutiveFailures: 0,
})

let dir: string
let path: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'github-inbox-events-'))
  path = join(dir, 'events.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function fileContent() {
  return JSON.parse(await readFile(path, 'utf-8')) as {
    events: GitHubEvent[]
    notifications: Record<string, string>
    threads: Record<string, unknown>
  }
}

describe('出来事と取り込みの記録の保存（component-backend.md 7.）', () => {
  it('初めて（ファイルが無い）なら空から始める', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    expect(await store.load(NOW)).toEqual({ recovered: false })
    expect(store.listForDisplay(7, NOW)).toEqual([])
    expect(store.notifications()).toEqual({})
  })

  it('保存したものを、次に立ち上げたときに読める', async () => {
    const first = new EventsStore(path, createMemoryLogger())
    await first.load(NOW)
    await first.commit(
      {
        events: [event('IC_1', daysBefore(1))],
        notifications: { etag: 'W/"abc"', lastSuccessAt: NOW.toISOString() },
        threads: { '1': thread(daysBefore(1)) },
      },
      NOW,
    )
    const second = new EventsStore(path, createMemoryLogger())
    await second.load(NOW)
    expect(second.listForDisplay(7, NOW).map((e) => e.id)).toEqual(['IC_1'])
    expect(second.notifications()).toEqual({ etag: 'W/"abc"', lastSuccessAt: NOW.toISOString() })
    expect(second.thread('1')).toEqual(thread(daysBefore(1)))
  })

  it('I-1: 同じ id の出来事は1件に重ね、新しく増えた分だけを返す', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    expect(
      (
        await store.commit(
          { events: [event('IC_1', daysBefore(1)), event('IC_2', daysBefore(2))] },
          NOW,
        )
      ).map((e) => e.id),
    ).toEqual(['IC_1', 'IC_2'])
    const again = await store.commit(
      {
        events: [event('IC_1', daysBefore(1), { excerpt: '後から' }), event('IC_3', daysBefore(3))],
      },
      NOW,
    )
    expect(again.map((e) => e.id)).toEqual(['IC_3'])
    expect((await fileContent()).events.map((e) => e.id).toSorted()).toEqual([
      'IC_1',
      'IC_2',
      'IC_3',
    ])
    // 先に受け取ったものを残す（受け取った時刻とデスクトップ通知の判定が変わらないように）
    expect(store.listForDisplay(30, NOW).find((e) => e.id === 'IC_1')?.excerpt).toBeUndefined()
  })

  it('I-5: 出来事と取り込みの記録を同じ書き込みで保存する（書けなければ、どちらも進めない）', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit(
      { events: [event('IC_1', daysBefore(1))], notifications: { etag: 'W/"1"' } },
      NOW,
    )
    // 保存先をフォルダにして、書けないようにする
    await rm(path)
    await (await import('node:fs/promises')).mkdir(path)
    await expect(
      store.commit(
        { events: [event('IC_2', daysBefore(1))], notifications: { etag: 'W/"2"' } },
        NOW,
      ),
    ).rejects.toThrow()
    expect(store.notifications()).toEqual({ etag: 'W/"1"' })
    expect(store.listForDisplay(30, NOW).map((e) => e.id)).toEqual(['IC_1'])
  })

  it('取り込みの記録は、渡したスレッドだけを置き換え、null なら消す', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit({ threads: { '1': thread(daysBefore(1)), '2': thread(daysBefore(2)) } }, NOW)
    await store.commit(
      { threads: { '1': { ...thread(daysBefore(1)), participating: true }, '2': null } },
      NOW,
    )
    expect(store.thread('1')?.participating).toBe(true)
    expect(store.thread('2')).toBeUndefined()
    expect(Object.keys((await fileContent()).threads)).toEqual(['1'])
  })

  it('GitHub の通知の問い合わせの記録は、渡した項目だけを変える', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit({ notifications: { etag: 'W/"1"', lastSuccessAt: daysBefore(1) } }, NOW)
    await store.commit({ notifications: { lastSuccessAt: NOW.toISOString() } }, NOW)
    expect(store.notifications()).toEqual({ etag: 'W/"1"', lastSuccessAt: NOW.toISOString() })
  })

  it('I-4: 立ち上げ時に、発生から30日を過ぎた出来事と、30日動きの無いスレッドの記録を消して保存し直す', async () => {
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        events: [
          event('old', daysBefore(30, 1)),
          event('edge', daysBefore(30)),
          event('new', daysBefore(1)),
        ],
        notifications: {},
        threads: { old: thread(daysBefore(31)), new: thread(daysBefore(1)) },
      }),
    )
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    expect(store.listForDisplay(30, NOW).map((e) => e.id)).toEqual(['new', 'edge'])
    expect(store.thread('old')).toBeUndefined()
    expect((await fileContent()).events.map((e) => e.id).toSorted()).toEqual(['edge', 'new'])
  })

  it('I-4: 24時間ごとの削除（purge）でも消し、消えたかを返す', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit({ events: [event('a', daysBefore(29)), event('b', daysBefore(1))] }, NOW)
    const later = new Date(NOW.getTime() + 2 * 86_400_000)
    expect(await store.purge(later)).toBe(true)
    expect(store.listForDisplay(30, later).map((e) => e.id)).toEqual(['b'])
    expect(await store.purge(later)).toBe(false)
  })

  it('I-4: 一覧に出すのは出来事の一覧の日数以内で、発生の新しい順', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit(
      {
        events: [
          event('d3', daysBefore(3)),
          event('d1', daysBefore(1)),
          event('d8', daysBefore(8)),
          event('d7', daysBefore(7)),
        ],
      },
      NOW,
    )
    expect(store.listForDisplay(7, NOW).map((e) => e.id)).toEqual(['d1', 'd3', 'd7'])
  })

  it('壊れていたら退避して空から始め、取り直しが要ることを返す（Q-09）', async () => {
    await writeFile(path, '{ broken')
    const logger = createMemoryLogger()
    const store = new EventsStore(path, logger)
    expect(await store.load(NOW)).toEqual({ recovered: true })
    expect(store.listForDisplay(30, NOW)).toEqual([])
    expect((await readdir(dir)).some((name) => name.startsWith('events.json.corrupt-'))).toBe(true)
    expect(logger.entries).toEqual([
      { level: 'warn', kind: 'store.corrupt', fields: { file: 'events.json' } },
    ])
  })

  it('出来事が I-3 の形に合わなければ（区分値の誤りなど）壊れたものとして扱う', async () => {
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        events: [event('x', daysBefore(1), { type: 'unknown' as never })],
        notifications: {},
        threads: {},
      }),
    )
    const store = new EventsStore(path, createMemoryLogger())
    expect(await store.load(NOW)).toEqual({ recovered: true })
  })

  it('サインアウトで消す（auth-flow.md 6.）。消した後は空', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    await store.load(NOW)
    await store.commit(
      { events: [event('IC_1', daysBefore(1))], notifications: { etag: 'W/"1"' } },
      NOW,
    )
    await store.clear()
    expect(store.listForDisplay(30, NOW)).toEqual([])
    expect(store.notifications()).toEqual({})
    expect(await readdir(dir)).toEqual([])
  })

  it('立ち上げで読み終わる前に呼ばれた書き込みは、読み終わってから行う', async () => {
    const store = new EventsStore(path, createMemoryLogger())
    const loading = store.load(NOW)
    const committing = store.commit({ events: [event('IC_1', daysBefore(1))] }, NOW)
    await Promise.all([loading, committing])
    expect(store.listForDisplay(30, NOW).map((e) => e.id)).toEqual(['IC_1'])
  })
})
