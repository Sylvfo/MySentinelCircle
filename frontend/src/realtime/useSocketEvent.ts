import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

// Listen to one live event while the component is mounted. The handler is
// always the latest one given (it can read the current state), and the
// listener only changes when the socket does.
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const { socket } = useAuth();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
