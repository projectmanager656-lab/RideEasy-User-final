import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { initSentry } from './initSentry'
import { LanguageProvider } from './i18n'

void initSentry()

createRoot(document.getElementById('root')).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </BrowserRouter>
)
