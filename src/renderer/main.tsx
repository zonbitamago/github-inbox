import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('#root が無い')
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
