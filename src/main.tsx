import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './shell.css'
import App from './App.tsx'

// Block postMessages from the Manus Previewer injected into embedded tools.
// Uses capture phase (true) so this runs before any other listener, including
// Vite HMR. stopImmediatePropagation prevents subsequent listeners from seeing
// the event at all.
window.addEventListener('message', (event) => {
  if (event.data?.type === 'SpacePreviewerChannel') {
    event.stopImmediatePropagation()
  }
}, true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
