import { io, type Socket } from 'socket.io-client';
import { API_URL, forgetSharedGets } from '../api/client';

// Same origin as the REST calls in api/client.ts: empty API_URL (Docker/
// nginx) connects to the current page's origin, which nginx already
// proxies to the backend's /socket.io/ path; a non-empty API_URL (plain
// `vite dev`, no nginx) connects straight to the backend.
export function createSocket(token: string): Socket {
  const socket = io(API_URL || undefined, { auth: { token } });
  // Connection failures are otherwise silent — the app just never gets
  // live updates, with no error anywhere a developer would look.
  socket.on('connect_error', (err) => console.warn('[realtime] connect_error:', err.message));
  // (Re)connected: events may have been missed meanwhile, so the lists
  // pages share are loaded again.
  socket.on('connect', () => {
    forgetSharedGets();
    console.info('[realtime] connected', socket.id);
  });
  // Any live event means something changed on the server. onAny listeners
  // run before the pages' own ones, so a page reloading on that event
  // already gets fresh data.
  socket.onAny((event, payload) => {
    forgetSharedGets();
    console.info('[realtime] event', event, payload);
  });
  return socket;
}
