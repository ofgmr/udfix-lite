import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { rendererStartupMark } from './lib/startupTiming'
import './fonts/loadAppFonts'
import './index.css'
import App from './App.tsx'

rendererStartupMark('renderer:main.tsx evaluated')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

rendererStartupMark('renderer:react render scheduled')
