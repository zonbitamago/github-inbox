import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../../test/support/memory-logger'
import { DEFAULT_SETTINGS, type GitHubEvent, type Settings } from '../../shared/domain'
import type { AppState } from '../../shared/ipc-contract'
import {
  DesktopNotifier,
  TEST_WAIT_MS,
  type DesktopNotificationEvent,
  type DesktopNotificationHandle,
} from './notifier'

const NOW = new Date('2026-01-31T12:00:00Z')

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
    receivedAt: occurredAt,
    ...change,
  }
}

/** 出したデスクトップ通知を覚えておく偽物（component-backend.md 9.） */
class FakeHandle implements DesktopNotificationHandle {
  shown = false
  private readonly listeners = new Map<DesktopNotificationEvent, (() => void)[]>()

  constructor(readonly content: { title: string; body: string }) {}

  on(name: DesktopNotificationEvent, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  show(): void {
    this.shown = true
  }

  emit(name: DesktopNotificationEvent): void {
    for (const listener of this.listeners.get(name) ?? []) listener()
  }
}

function setup(
  options: { settings?: Settings; outsideApplicationsFolder?: boolean; supported?: boolean } = {},
) {
  const created: FakeHandle[] = []
  const failures: AppState['desktopNotification'][] = []
  const focused: string[] = []
  const waits: { callback: () => void; delayMs: number; cancelled: boolean }[] = []
  let broughtToFront = 0
  const logger = createMemoryLogger()
  const holder = { now: NOW }
  const notifier = new DesktopNotifier({
    isSupported: () => options.supported ?? true,
    create: (content) => {
      const handle = new FakeHandle(content)
      created.push(handle)
      return handle
    },
    settings: () => options.settings ?? DEFAULT_SETTINGS,
    outsideApplicationsFolder: () => options.outsideApplicationsFolder ?? false,
    now: () => holder.now,
    logger,
    publishFailure: (view) => failures.push(view),
    focusEvent: (eventId) => focused.push(eventId),
    bringToFront: () => {
      broughtToFront += 1
    },
    schedule: (callback, delayMs) => {
      const wait = { callback, delayMs, cancelled: false }
      waits.push(wait)
      return () => {
        wait.cancelled = true
      }
    },
  })
  return {
    notifier,
    created,
    failures,
    focused,
    logger,
    holder,
    waits,
    broughtToFront: () => broughtToFront,
  }
}

const recent = event('IC_2', '2026-01-31T11:58:00Z')
const older = event('IC_1', '2026-01-31T11:55:00Z', {
  type: 'review',
  reviewResult: 'approved',
})

describe('デスクトップ通知を出す（F-07、component-backend.md 5.4）', () => {
  it('定期の取り込みで届いた出来事に、古い順に出す', () => {
    const { notifier, created } = setup()
    notifier.notifyLive([recent, older])
    expect(created.map((handle) => [handle.content, handle.shown])).toEqual([
      [
        { title: 'レビュー（承認） · example-org/app #101', body: 'bob: ログイン画面の文言を直す' },
        true,
      ],
      [{ title: 'コメント · example-org/app #101', body: 'bob: ログイン画面の文言を直す' }, true],
    ])
  })

  it('設定の言語で出す', () => {
    const { notifier, created } = setup({ settings: { ...DEFAULT_SETTINGS, language: 'en' } })
    notifier.notifyLive([recent])
    expect(created[0]?.content.title).toBe('Comment · example-org/app #101')
  })

  it('出すかは domain-model.md 4.4 で決める（10分より前・オフの種類・同じ出来事には出さない）', () => {
    const { notifier, created } = setup({
      settings: {
        ...DEFAULT_SETTINGS,
        desktopNotification: {
          ...DEFAULT_SETTINGS.desktopNotification,
          byType: { ...DEFAULT_SETTINGS.desktopNotification.byType, mention: false },
        },
      },
    })
    notifier.notifyLive([
      recent,
      event('IC_OLD', '2026-01-31T11:49:59Z'),
      event('IC_MENTION', '2026-01-31T11:59:00Z', { type: 'mention' }),
    ])
    notifier.notifyLive([recent])
    expect(created).toHaveLength(1)
  })

  it('出した記録をログに書く。タイトル・本文は書かない（S-09）', () => {
    const { notifier, created, logger } = setup()
    notifier.notifyLive([recent])
    created[0]?.emit('show')
    expect(logger.entries).toEqual([
      {
        level: 'info',
        kind: 'notify.shown',
        fields: { eventId: 'IC_2', type: 'comment', occurredAt: '2026-01-31T11:58:00Z' },
      },
    ])
  })
})

describe('クリックで前面に出す（F-08、AC-11）', () => {
  it('クリックされたら、その出来事を知らせる', () => {
    const { notifier, created, focused } = setup()
    notifier.notifyLive([recent, older])
    created[1]?.emit('click')
    expect(focused).toEqual(['IC_2'])
  })
})

describe('出せなかったことの知らせ（N-09、Q-07、AC-38）', () => {
  it('OS が断ったら、すぐ os_rejected を知らせる', () => {
    const { notifier, created, failures, logger } = setup()
    notifier.notifyLive([recent])
    created[0]?.emit('failed')
    expect(failures).toEqual([{ failure: 'os_rejected', failedAt: NOW.toISOString() }])
    expect(logger.entries).toContainEqual({
      level: 'warn',
      kind: 'notify.failed',
      fields: { eventId: 'IC_2', reason: 'os_rejected' },
    })
  })

  it('Mac でアプリケーションフォルダの外から開いていれば、outside_applications_folder を知らせる', () => {
    const { notifier, created, failures } = setup({ outsideApplicationsFolder: true })
    notifier.notifyLive([recent])
    created[0]?.emit('failed')
    expect(failures).toEqual([
      { failure: 'outside_applications_folder', failedAt: NOW.toISOString() },
    ])
  })

  it('次に出せたら、知らせを消す', () => {
    const { notifier, created, failures, holder } = setup()
    notifier.notifyLive([recent])
    created[0]?.emit('failed')
    holder.now = new Date('2026-01-31T12:01:00Z')
    notifier.notifyLive([event('IC_3', '2026-01-31T12:00:30Z')])
    created[1]?.emit('show')
    expect(failures.at(-1)).toEqual({})
  })

  it('出せている間は、知らせを変えない', () => {
    const { notifier, created, failures } = setup()
    notifier.notifyLive([recent])
    created[0]?.emit('show')
    expect(failures).toEqual([])
  })

  it('OS がデスクトップ通知に対応していなければ、出さずに os_rejected を知らせる', () => {
    const { notifier, created, failures } = setup({ supported: false })
    notifier.notifyLive([recent])
    expect(created).toEqual([])
    expect(failures).toEqual([{ failure: 'os_rejected', failedAt: NOW.toISOString() }])
  })

  it('出すものが無ければ、対応しているかを問わない', () => {
    const { notifier, failures } = setup({ supported: false })
    notifier.notifyLive([event('IC_OLD', '2026-01-31T11:00:00Z')])
    expect(failures).toEqual([])
  })
})

// F-36 (4)、N-09、D-033。ipc-contract.md 2. の onboarding:sendTestNotification
describe('試しのデスクトップ通知', () => {
  it('設定の言語で1件出し、OS が受け付けたら shown を返す', async () => {
    const { notifier, created, waits, logger } = setup({
      settings: { ...DEFAULT_SETTINGS, language: 'en' },
    })
    const outcome = notifier.sendTest()
    expect(created.map((handle) => [handle.content, handle.shown])).toEqual([
      [{ title: 'github-inbox', body: 'This is a test desktop notification.' }, true],
    ])
    expect(waits.map((wait) => wait.delayMs)).toEqual([TEST_WAIT_MS])

    created[0]?.emit('show')
    await expect(outcome).resolves.toBe('shown')
    expect(waits[0]?.cancelled).toBe(true)
    expect(logger.entries).toContainEqual({
      level: 'info',
      kind: 'notify.test',
      fields: { outcome: 'shown' },
    })
  })

  it('5秒のうちに出た・失敗したが分からなければ unknown を返す', async () => {
    const { notifier, waits } = setup()
    const outcome = notifier.sendTest()
    waits[0]?.callback()
    await expect(outcome).resolves.toBe('unknown')
  })

  it('OS が断ったら failed を返し、出来事のときと同じく知らせる', async () => {
    const { notifier, created, failures } = setup({ outsideApplicationsFolder: true })
    const outcome = notifier.sendTest()
    created[0]?.emit('failed')
    await expect(outcome).resolves.toBe('failed')
    expect(failures).toEqual([
      { failure: 'outside_applications_folder', failedAt: NOW.toISOString() },
    ])
  })

  it('OS がデスクトップ通知に対応していなければ、出さずに failed を返す', async () => {
    const { notifier, created, failures } = setup({ supported: false })
    await expect(notifier.sendTest()).resolves.toBe('failed')
    expect(created).toEqual([])
    expect(failures).toEqual([{ failure: 'os_rejected', failedAt: NOW.toISOString() }])
  })

  it('出せたら、前に出せなかったことの知らせを消す', async () => {
    const { notifier, created, failures } = setup()
    notifier.notifyLive([recent])
    created[0]?.emit('failed')
    const outcome = notifier.sendTest()
    created[1]?.emit('show')
    await outcome
    expect(failures).toEqual([{ failure: 'os_rejected', failedAt: NOW.toISOString() }, {}])
  })

  it('答えた後に届いた知らせでは、答えを変えない', async () => {
    const { notifier, created, waits } = setup()
    const outcome = notifier.sendTest()
    waits[0]?.callback()
    created[0]?.emit('show')
    await expect(outcome).resolves.toBe('unknown')
  })

  it('クリックされたら窓を前に出す（出来事は知らせない）', async () => {
    const { notifier, created, focused, broughtToFront } = setup()
    const outcome = notifier.sendTest()
    created[0]?.emit('show')
    await outcome
    created[0]?.emit('click')
    expect(broughtToFront()).toBe(1)
    expect(focused).toEqual([])
  })
})
