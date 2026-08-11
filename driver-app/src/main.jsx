import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom';
import UserContext from './context/UserContext';
import CaptainContext from './context/CaptainContext';
import SocketProvider from './context/SocketContext';
import { initSentry } from './initSentry';

void initSentry();

createRoot(document.getElementById('root')).render(

  <SocketProvider>
    <CaptainContext>
      <UserContext>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </UserContext>
    </CaptainContext>
  </SocketProvider>

)
