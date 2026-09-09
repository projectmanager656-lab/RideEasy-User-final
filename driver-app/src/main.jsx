import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom';
import UserContext from './context/UserContext';
import CaptainContext from './context/CaptainContext';
import SocketProvider from './context/SocketContext';
import { initSentry } from './initSentry';
import { LanguageProvider } from './i18n'

void initSentry();

createRoot(document.getElementById('root')).render(

  <SocketProvider>
    <CaptainContext>
      <UserContext>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </BrowserRouter>
      </UserContext>
    </CaptainContext>
  </SocketProvider>

)
