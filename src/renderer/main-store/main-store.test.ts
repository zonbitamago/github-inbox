import { describe, expect, it } from 'vitest'
import { appState, createFakeApi, githubEvent } from '../../../test/support/fake-github-inbox-api'
import { createMainStore } from './main-store'

describe('メインから届く状態の store（component-frontend.md 4.、ADR-012）', () => {
  it('知らせの受け取りを始めてから、最初の値を取りに行く', async () => {
    const api = createFakeApi({ state: appState() })
    const store = createMainStore(api)
    await store.start()
    const firstInvoke = api.calls.findIndex((call) => call.startsWith('invoke:'))
    expect(api.calls.slice(0, firstInvoke)).toEqual([
      'on:state:changed',
      'on:events:added',
      'on:events:reset',
      'on:prs:updated',
    ])
  })

  it('取りに行く前は読み込み中、取ったら状態・出来事・PR の一覧を持つ', async () => {
    const events = [githubEvent('IC_1', '2026-01-02T00:00:00Z')]
    const store = createMainStore(createFakeApi({ state: appState(), events }))
    expect(store.getSnapshot()).toEqual({
      loaded: false,
      loadFailed: false,
      appState: null,
      events: [],
      prList: null,
    })
    await store.start()
    expect(store.getSnapshot()).toEqual({
      loaded: true,
      loadFailed: false,
      appState: appState(),
      events,
      prList: null,
    })
  })

  it('events:added は足して発生の新しい順にし、同じ id は1件にする', async () => {
    const api = createFakeApi({
      state: appState(),
      events: [githubEvent('IC_1', '2026-01-02T00:00:00Z')],
    })
    const store = createMainStore(api)
    await store.start()
    api.push('events:added', [
      githubEvent('IC_2', '2026-01-03T00:00:00Z'),
      githubEvent('IC_1', '2026-01-02T00:00:00Z'),
    ])
    expect(store.getSnapshot().events.map((event) => event.id)).toEqual(['IC_2', 'IC_1'])
  })

  it('events:reset は入れ替える', async () => {
    const api = createFakeApi({
      state: appState(),
      events: [githubEvent('IC_1', '2026-01-02T00:00:00Z')],
    })
    const store = createMainStore(api)
    await store.start()
    api.push('events:reset', [])
    expect(store.getSnapshot().events).toEqual([])
  })

  it('state:changed と prs:updated で置き換え、そのたびに知らせる（画面からは書き換えない）', async () => {
    const api = createFakeApi({ state: appState() })
    const store = createMainStore(api)
    await store.start()
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })
    api.push('state:changed', appState({ ingest: { state: 'offline' } }))
    api.push('prs:updated', { items: [], periodDays: 7, fetchedAt: '2026-01-02T00:00:00Z' })
    expect(store.getSnapshot().appState?.ingest.state).toBe('offline')
    expect(store.getSnapshot().prList?.periodDays).toBe(7)
    expect(notified).toBe(2)
  })

  it('取りに行く間に届いた state:changed は、取った値で上書きしない（新しい方を残す）', async () => {
    const api = createFakeApi({ state: appState() })
    const store = createMainStore(api)
    const starting = store.start()
    api.push('state:changed', appState({ ingest: { state: 'syncing' } }))
    await starting
    expect(store.getSnapshot().appState?.ingest.state).toBe('syncing')
  })

  it('取りに行く間に届いた出来事も落とさない', async () => {
    const api = createFakeApi({
      state: appState(),
      events: [githubEvent('IC_1', '2026-01-02T00:00:00Z')],
    })
    const store = createMainStore(api)
    const starting = store.start()
    api.push('events:added', [githubEvent('IC_2', '2026-01-03T00:00:00Z')])
    await starting
    expect(store.getSnapshot().events.map((event) => event.id)).toEqual(['IC_2', 'IC_1'])
  })

  it('知らせをやめると、受け取りを外し、もう知らせない', async () => {
    const api = createFakeApi({ state: appState() })
    const store = createMainStore(api)
    await store.start()
    let notified = 0
    const unsubscribe = store.subscribe(() => {
      notified += 1
    })
    unsubscribe()
    store.stop()
    api.push('state:changed', appState({ ingest: { state: 'offline' } }))
    expect(notified).toBe(0)
    expect(api.listeners('state:changed')).toBe(0)
  })

  it('最初の値を取れなければ、取れなかったことを持つ（読み込み中のまま止まらない）', async () => {
    const api = createFakeApi({ state: appState() })
    api.invoke = () => Promise.reject(new Error('internal'))
    const store = createMainStore(api)
    await store.start()
    expect(store.getSnapshot()).toMatchObject({ loaded: false, loadFailed: true })
  })
})
