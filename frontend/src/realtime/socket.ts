import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../api/client';

// Same origin as the REST calls in api/client.ts: empty API_URL (Docker/
// nginx) connects to the current page's origin, which nginx already
// proxies to the backend's /socket.io/ path; a non-empty API_URL (plain
// `vite dev`, no nginx) connects straight to the backend.
export function createSocket(token: string): Socket {
  const socket = io(API_URL || undefined, { auth: { token } });
  // Connection failures are otherwise silent — the app just never gets
  // live updates, with no error anywhere a developer would look.
  socket.on('connect_error', (err) => console.warn('[realtime] connect_error:', err.message));
  socket.on('connect', () => console.info('[realtime] connected', socket.id));
  socket.onAny((event, payload) => console.info('[realtime] event', event, payload));
  return socket;
}
