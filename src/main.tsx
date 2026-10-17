import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installShield } from './lib/shield'
import './styles/global.css'

installShield()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
