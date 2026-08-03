import { createRoot } from 'react-dom/client'
import App from './App'

const container = document.getElementById('app')
const root = createRoot(container)

// Keep the loader perceptible on a warm local cache without making genuinely
// slow loads wait any longer. The timestamp is set when the boot markup paints.
const bootStartedAt = window.__openingBootStartedAt ?? performance.now()
const isGameRoute = window.location.pathname === '/game' || window.location.pathname.startsWith('/game/')
const minimumBootMs = isGameRoute ? 650 : 0
const remainingBootMs = Math.max(0, minimumBootMs - (performance.now() - bootStartedAt))

window.setTimeout(() => root.render(<App />), remainingBootMs)
