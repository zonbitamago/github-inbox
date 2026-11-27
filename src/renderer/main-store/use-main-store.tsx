import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { MainSnapshot, MainStore } from './main-store'

const MainStoreContext = createContext<MainStore | null>(null)

export function MainStoreProvider({ store, children }: { store: MainStore; children: ReactNode }) {
  return <MainStoreContext.Provider value={store}>{children}</MainStoreContext.Provider>
}

function useMainStore(): MainStore {
  const store = useContext(MainStoreContext)
  if (store === null) throw new Error('MainStoreProvider の外で使っている')
  return store
}

/** メインから届く状態を読む（ADR-012） */
export function useMainSnapshot(): MainSnapshot {
  const store = useMainStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/** メインに頼む関数。状態は書き換えず、push で戻ってきた値を出す（component-frontend.md 4.） */
export function useInvoke(): MainStore['invoke'] {
  return useMainStore().invoke
}
