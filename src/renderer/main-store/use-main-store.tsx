import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { MainSnapshot, MainStore } from './main-store'

const MainStoreContext = createContext<MainStore | null>(null)

export function MainStoreProvider({ store, children }: { store: MainStore; children: ReactNode }) {
  return <MainStoreContext.Provider value={store}>{children}</MainStoreContext.Provider>
}

/** メインから届く状態を読む（ADR-012） */
export function useMainSnapshot(): MainSnapshot {
  const store = useContext(MainStoreContext)
  if (store === null) throw new Error('MainStoreProvider の外で使っている')
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
