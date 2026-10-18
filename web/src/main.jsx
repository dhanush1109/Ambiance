import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SplashScreen } from '@capacitor/splash-screen'

// Fonts are bundled, not fetched. A car is offline far more often than not,
// and a CDN font would silently fall back to a system face exactly when the
// app matters most. Inter is the closest freely-licensed match to SF Pro —
// one family carrying every weight, the way Apple's own type system works,
// rather than pairing two unrelated display/body faces.
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'

import './theme/tokens.css'
import './theme/glass.css'
import App from './App'
import { applyPlatformDataset } from './services/platform'

applyPlatformDataset()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

SplashScreen.hide().catch(() => {})
