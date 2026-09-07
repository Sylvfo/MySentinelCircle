import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { loadGoogleIdentityScript } from '../auth/loadGoogleScript';

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  fallbackLabel: string;
}

// Renders Google's own "Sign in with Google" button via Google Identity
// Services (no client library — just their script + a callback that hands
// us the ID token). Falls back to a static placeholder if
// VITE_GOOGLE_CLIENT_ID isn't set, so the app degrades gracefully.
export function GoogleSignInButton({ onCredential, fallbackLabel }: GoogleSignInButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGoogleIdentityScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: 320,
        locale: i18n.language,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, i18n.language]);

  if (!clientId) {
    return <p className="google-btn-placeholder">{fallbackLabel}</p>;
  }

  return <div ref={ref} />;
}
