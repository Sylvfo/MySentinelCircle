import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext';
import { updateProfile } from './api/user';

// The SMS I receive are written in my language: the one I use in the app.
// Saved on my account whenever it differs (first visit, or after switching
// languages). Mounted once, in AppShell.
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const language = i18n.language?.startsWith('en') ? 'en' : 'fr';
  // The language being saved: sent once, not again on every render.
  const sending = useRef<string | null>(null);

  useEffect(() => {
    if (!user || user.language === language || sending.current === language) return;
    sending.current = language;
    // Best effort: the SMS just stay in the previous language if it fails.
    updateProfile({ language })
      .then(() => refreshUser())
      .catch(() => undefined)
      .finally(() => {
        sending.current = null;
      });
  }, [user, language, refreshUser]);
}
