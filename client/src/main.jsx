import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'

// This is a convenience deterrent, not a security boundary. Browser controls,
// extensions, and other developer tools cannot be reliably disabled by a website.
function installInteractionGuards() {
  const preventContextMenu = (event) => event.preventDefault()
  const preventDevToolsShortcuts = (event) => {
    const key = event.key.toLowerCase()
    const blockedDevTools =
      event.key === 'F12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
      (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u')
    const blockedBrowserZoom =
      (event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(event.key)
    if (blockedDevTools || blockedBrowserZoom) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const preventWheelZoom = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }

  document.addEventListener('contextmenu', preventContextMenu)
  document.addEventListener('keydown', preventDevToolsShortcuts, true)
  document.addEventListener('wheel', preventWheelZoom, { passive: false })
  return () => {
    document.removeEventListener('contextmenu', preventContextMenu)
    document.removeEventListener('keydown', preventDevToolsShortcuts, true)
    document.removeEventListener('wheel', preventWheelZoom)
  }
}

const removeInteractionGuards = installInteractionGuards()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if (import.meta.hot) import.meta.hot.dispose(removeInteractionGuards)
