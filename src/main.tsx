import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// When a new service worker takes control, notify the app so it can show
// a user-visible update banner instead of reloading silently.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('sw-update-ready'))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
