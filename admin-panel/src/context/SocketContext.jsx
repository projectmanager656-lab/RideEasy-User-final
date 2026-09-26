import React, { createContext, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config/apiBaseUrl';
import { getAdminToken, getCaptainToken, getPassengerToken } from '../utils/authTokens';

export const SocketContext = createContext();

/** Whichever session this app currently holds (admin console, or the captain/user pages). */
function sessionToken () {
    return getAdminToken() || getCaptainToken() || getPassengerToken() || '';
}

/** Vercel serverless cannot keep Socket.IO connections; set VITE_DISABLE_SOCKET=true there. */
function createNoOpSocket () {
    const noop = () => {};
    return {
        connected: false,
        on: noop,
        off: noop,
        once: noop,
        emit: noop,
        disconnect: noop,
        removeAllListeners: noop,
        connect: noop,
    };
}

const socket =
    import.meta.env.VITE_DISABLE_SOCKET === 'true'
        ? createNoOpSocket()
        : io(API_BASE_URL, {
              autoConnect: false,
              transports: [ 'websocket', 'polling' ],
              withCredentials: false,
              reconnectionAttempts: Infinity,
              reconnectionDelay: 1500,
              reconnectionDelayMax: 10000,
          });

if (import.meta.env.VITE_DISABLE_SOCKET !== 'true') {
    // The backend ignores the payload and keys rooms off the JWT's role, so this simply
    // puts an authenticated socket into its room (admin / user / driver).
    socket.on('connect', () => {
        socket.emit('join', {});
    });
}

const SocketProvider = ({ children }) => {
    const value = useMemo(() => ({ socket }), []);

    useEffect(() => {
        if (import.meta.env.VITE_DISABLE_SOCKET === 'true') return;

        let cancelled = false;

        const syncConnection = async () => {
            const token = sessionToken();
            if (!token) {
                if (socket.connected) socket.disconnect();
                return;
            }
            for (let i = 0; i < 60 && !cancelled; i++) {
                try {
                    const res = await fetch(`${API_BASE_URL}/health/live`, { cache: 'no-store' });
                    if (res.ok) break;
                } catch {
                    /* backend not listening yet */
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            if (cancelled) return;
            // The backend rejects unauthenticated sockets, and targets rooms by the
            // JWT's subject, so the token must be in the handshake before connecting.
            if (socket.auth?.token !== token) {
                if (socket.connected) socket.disconnect();
                socket.auth = { token };
            }
            if (!socket.connected) socket.connect();
        };

        const onSessionChanged = () => { void syncConnection(); };
        window.addEventListener('rideeasy:session-changed', onSessionChanged);
        void syncConnection();

        return () => {
            cancelled = true;
            window.removeEventListener('rideeasy:session-changed', onSessionChanged);
        };
    }, []);

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketProvider;
