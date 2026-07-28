import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dev only: show the port in the tab title ("Flight Explorer :5175") so the
// researcher can confirm at a glance that each app is on its assigned port.
// Deliberately NOT rendered on the page — participants see the three apps'
// UIs unchanged, so no extra chrome enters the study instrument.
if (import.meta.env.DEV && location.port) {
  document.title = `${document.title} :${location.port}`
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
