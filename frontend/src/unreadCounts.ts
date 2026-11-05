import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { NOTIFICATIONS_CHANGED, getUnreadCount } from './api/notification';

// Unread counts shared by every badge (the bell, the Messages tab in the
// bottom bar and in the side nav): one request feeds them all, instead of
// one per badge — the API rate limit is per IP, shared app-wide.
// `count` = everything but messages (the bell), `messages` = new messages.
type UnreadCounts = { count: number; messages: number };

let state: UnreadCounts = { count: 0, messages: 0 };
const listeners = new Set<() => void>();

export function refreshUnreadCounts() {
  getUnreadCount()
    .then((next) => {
      state = next;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

// Lets a badge drop by one right away (a notification clicked), before the
// next refresh confirms it.
export function decrementUnreadCount() {
  state = { ...state, count: Math.max(0, state.count - 1) };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUnreadCounts(): UnreadCounts {
  return useSyncExternalStore(subscribe, () => state);
}

// Mounted once (AppShell): refreshes on navigation, on a live notification,
// and when a page marks notifications read itself (opening a conversation).
export function useUnreadCountsRefresher() {
  const { socket } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    refreshUnreadCounts();
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshUnreadCounts);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refreshUnreadCounts);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', refreshUnreadCounts);
    return () => {
      socket.off('notification:new', refreshUnreadCounts);
    };
  }, [socket]);
}
