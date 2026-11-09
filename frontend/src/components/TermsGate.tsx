import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { acceptTerms } from '../api/user';
import { useAuth } from '../auth/AuthContext';
import { useAction } from '../useAction';

// Before anything else, a logged-in person must have accepted the current
// terms of use + privacy policy (nLPD / GDPR): new accounts made by phone,
// accounts made before consent existed, and everyone after a new version.
export function TermsGate({ children }: { children: ReactNode }) {
  const { user, refreshUser, logout } = useAuth();
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const { busy: saving, error, run } = useAction();

  if (!user || user.termsUpToDate) return <>{children}</>;

  const accept = () =>
    run(async () => {
      await acceptTerms();
      await refreshUser();
    });

  return (
    <div className="auth-page terms-gate">
      <h1>{t('legal.gate.title')}</h1>
      <p>{t('legal.gate.intro')}</p>
      <TermsCheckbox checked={checked} onChange={setChecked} />
      {error && <p className="form-error">{error}</p>}
      <button type="button" disabled={!checked || saving} onClick={() => void accept()}>
        {t('legal.gate.accept')}
      </button>
      <p className="switch-link">
        <button type="button" className="link-button" onClick={logout}>
          {t('legal.gate.logout')}
        </button>
      </p>
    </div>
  );
}

// "I accept the terms of use and the privacy policy" — the links open in a
// new tab so a half-filled signup form isn't lost.
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="terms-checkbox">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {t('legal.accept.before')}
        <Link to="/terms" target="_blank" rel="noopener">
          {t('legal.accept.terms')}
        </Link>
        {t('legal.accept.and')}
        <Link to="/privacy" target="_blank" rel="noopener">
          {t('legal.accept.privacy')}
        </Link>
        {t('legal.accept.after')}
      </span>
    </label>
  );
}
