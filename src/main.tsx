import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// When a new service worker takes control, wait for the next time the user
// opens the app from background before reloading — avoids interrupting
// active usage while still guaranteeing the update is applied.
if ('serviceWorker' in navigator) {
  let updatePending = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updatePending = true
  })

  document.addEventListener('visibilitychange', () => {
    if (updatePending && document.visibilityState === 'visible') {
      window.location.reload()
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
