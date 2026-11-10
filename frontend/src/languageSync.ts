import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext';
import { updateProfile } from './api/user';

// The SMS I receive are written in my language: the one I use in the app,
// and give times in my time zone: the browser's. Both saved on my account
// whenever they differ (first visit, after switching languages, or from a
// phone set to another zone while travelling). Mounted once, in AppShell.
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const language: 'fr' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const timeZone = browserTimeZone();
  // What is being saved: sent once, not again on every render.
  const sending = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const changes = {
      ...(user.language !== language ? { language } : {}),
      ...(timeZone && user.timeZone !== timeZone ? { timeZone } : {}),
    };
    const key = JSON.stringify(changes);
    if (key === '{}' || sending.current === key) return;
    sending.current = key;
    // Best effort: the SMS just stay as before if it fails.
    updateProfile(changes)
      .then(() => refreshUser())
      .catch(() => undefined)
      .finally(() => {
        sending.current = null;
      });
  }, [user, language, timeZone, refreshUser]);
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
