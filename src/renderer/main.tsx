import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createMainStore } from './main-store/main-store'
import { MainStoreProvider } from './main-store/use-main-store'
import './styles/tokens.css'
import './styles/base.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('#root が無い')
}
const store = createMainStore(window.githubInbox)
createRoot(container).render(
  <StrictMode>
    <MainStoreProvider store={store}>
      <App />
    </MainStoreProvider>
  </StrictMode>,
)
// 失敗は store が loadFailed として持ち、画面に出す
void store.start()
