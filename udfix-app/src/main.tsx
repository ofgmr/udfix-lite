import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { rendererStartupMark } from './lib/startupTiming'
import { installRendererDiagnostics } from './utils/rendererDiagnostics'
import './fonts/loadAppFonts'
import './index.css'
import App from './App.tsx'

rendererStartupMark('renderer:main.tsx evaluated')
installRendererDiagnostics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

rendererStartupMark('renderer:react render scheduled')
