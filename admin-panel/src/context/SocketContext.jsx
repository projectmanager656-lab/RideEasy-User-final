import React, { createContext, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config/apiBaseUrl';

export const SocketContext = createContext();

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

const SocketProvider = ({ children }) => {
    useEffect(() => {
        if (import.meta.env.VITE_DISABLE_SOCKET === 'true') return;

        let cancelled = false;

        (async () => {
            for (let i = 0; i < 60 && !cancelled; i++) {
                try {
                    const res = await fetch(`${API_BASE_URL}/health/live`, { cache: 'no-store' });
                    if (res.ok) break;
                } catch {
                    /* backend not listening yet */
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            if (!cancelled) socket.connect();
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketProvider;
