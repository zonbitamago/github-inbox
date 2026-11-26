// メインから届く状態を持つ小さな store（component-frontend.md 4.、ADR-012）。
// 画面からは書き換えない。変えるときは invoke で頼み、push で戻ってきた値を出す。
// 知らせの受け取りを始めてから最初の値を取りに行く（取りに行く間に届いた知らせを落とさないため）。
import type { GitHubEvent } from '../../shared/domain'
import type { AppState, GithubInboxApi, PrListSnapshot } from '../../shared/ipc-contract'

export interface MainSnapshot {
  /** 最初の値を取り終えた */
  loaded: boolean
  /** 最初の値を取れなかった（読み込み中のまま止まらないように） */
  loadFailed: boolean
  appState: AppState | null
  /** 発生の新しい順 */
  events: GitHubEvent[]
  prList: PrListSnapshot | null
}

/** useSyncExternalStore にそのまま渡せるよう、this を使わない関数の項目にする */
export interface MainStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => MainSnapshot
  start: () => Promise<void>
  stop: () => void
}

const newestFirst = (events: GitHubEvent[]) =>
  events.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt))

/** 同じ id は1件にする（先にあった方を残す。メインの保存と同じ。I-1） */
function mergeEvents(current: GitHubEvent[], added: GitHubEvent[]): GitHubEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]))
  for (const event of added) {
    if (!byId.has(event.id)) byId.set(event.id, event)
  }
  return newestFirst([...byId.values()])
}

export function createMainStore(api: GithubInboxApi): MainStore {
  let snapshot: MainSnapshot = {
    loaded: false,
    loadFailed: false,
    appState: null,
    events: [],
    prList: null,
  }
  const listeners = new Set<() => void>()
  const unsubscribes: (() => void)[] = []
  // 取りに行く間に知らせで届いたものは、取った値より新しいので残す
  let statePushed = false
  let eventsReset = false
  let prListPushed = false

  const set = (change: Partial<MainSnapshot>) => {
    snapshot = { ...snapshot, ...change }
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    async start() {
      unsubscribes.push(
        api.on('state:changed', (state) => {
          statePushed = true
          set({ appState: state })
        }),
        api.on('events:added', (added) => set({ events: mergeEvents(snapshot.events, added) })),
        api.on('events:reset', (all) => {
          eventsReset = true
          set({ events: newestFirst(all) })
        }),
        api.on('prs:updated', (prList) => {
          prListPushed = true
          set({ prList })
        }),
      )
      try {
        const [state, events, prList] = await Promise.all([
          api.invoke('app:getState'),
          api.invoke('events:list'),
          api.invoke('prs:get'),
        ])
        set({
          loaded: true,
          appState: statePushed ? snapshot.appState : state,
          events: eventsReset ? snapshot.events : mergeEvents(snapshot.events, events),
          prList: prListPushed ? snapshot.prList : prList,
        })
      } catch {
        set({ loadFailed: true })
      }
    },
    stop() {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
    },
  }
}
