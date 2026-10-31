import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-bengali'
import '@fontsource/caveat/600.css'
import './styles.css'
import App from './App.jsx'
import { AppProvider } from './lib/app.jsx'
import { AuthProvider } from './lib/auth.jsx'

// scroll reveals start hidden only when scripts run (see [data-reveal] in styles.css)
document.documentElement.classList.add('js')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
