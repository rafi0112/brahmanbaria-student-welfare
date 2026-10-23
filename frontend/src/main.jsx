import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/manrope'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/dm-serif-display/400-italic.css'
import '@fontsource/hind-siliguri/bengali-400.css'
import '@fontsource/hind-siliguri/bengali-500.css'
import '@fontsource/hind-siliguri/bengali-600.css'
import '@fontsource/noto-serif-bengali/bengali-600.css'
import '@fontsource/noto-serif-bengali/bengali-700.css'
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
