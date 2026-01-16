import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

console.log('[Main] Starting application...')

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element not found')
  }

  const root = ReactDOM.createRoot(rootElement)
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  
  console.log('[Main] Application rendered')
} catch (error) {
  console.error('[Main] Failed to render application:', error)
  document.body.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050A1A; color: #F0F2F5; font-family: Inter, sans-serif; padding: 2rem;">
      <div style="text-align: center; max-width: 600px;">
        <h1 style="color: #ff4444; margin-bottom: 1rem;">Application Failed to Load</h1>
        <p style="color: #C5CAD3; margin-bottom: 1rem;">${error instanceof Error ? error.message : String(error)}</p>
        <pre style="background: #11151C; padding: 1rem; border-radius: 0.5rem; overflow: auto; text-align: left; font-size: 0.875rem;">
          ${error instanceof Error ? error.stack : String(error)}
        </pre>
        <button 
          onclick="window.location.reload()" 
          style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #DAA520; color: #050A1A; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer;"
        >
          Refresh Page
        </button>
      </div>
    </div>
  `
}

