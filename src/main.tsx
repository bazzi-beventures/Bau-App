import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { runStorageMigrations } from './api/storageMigrations'

// Vor dem ersten Render: Client-State auf aktuelles Schema migrieren,
// damit User nach Breaking-Changes nicht manuell den Cache löschen müssen.
runStorageMigrations()

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
