import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { listMyLogins, logoutEverywhere } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { useAction } from '../useAction';
import { useLoad } from '../useLoad';
import { ConfirmModal } from './Modal';
import { Loading } from './Loading';

// My last sign-ins, the failed ones too: one I didn't make means someone has
// (or tries) my password. Then "sign me out everywhere" puts them out.
export function LoginHistory() {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { data: logins = [], loading, error } = useLoad(listMyLogins);
  const { busy, error: signOutError, run } = useAction();
  const [asking, setAsking] = useState(false);

  const signOutEverywhere = () => {
    setAsking(false);
    void run(async () => {
      await logoutEverywhere();
      logout();
      navigate('/login');
    });
  };

  return (
    <div className="login-history">
      <label>{t('settings.logins.title')}</label>
      <p className="form-hint">{t('settings.logins.hint')}</p>
      {loading && <Loading />}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && logins.length === 0 && <p className="muted">{t('settings.logins.none')}</p>}
      {logins.length > 0 && (
        <ul className="login-history-list">
          {logins.map((l) => (
            <li key={`${l.createdAt}-${l.method}-${String(l.success)}`} className={l.success ? '' : 'failed'}>
              <span className="login-history-when">
                <strong>{l.success ? t('settings.logins.success') : t('settings.logins.failed')}</strong>
                {' · '}
                {new Date(l.createdAt).toLocaleString(i18n.language)}
              </span>
              <span className="muted muted-small">
                {t(`settings.logins.method.${l.method}`)} · {deviceOf(l.userAgent, t)}
                {l.ipPrefix && ` · ${l.ipPrefix}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ghost danger" disabled={busy} onClick={() => setAsking(true)}>
        {t('settings.logins.signOutEverywhere')}
      </button>
      {signOutError && <p className="form-error">{signOutError}</p>}
      {asking && (
        <ConfirmModal
          message={t('settings.logins.signOutConfirm')}
          confirmLabel={t('settings.logins.signOutEverywhere')}
          onConfirm={signOutEverywhere}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  );
}

// "Firefox · Windows" from the browser's description of itself, enough to
// recognize one's own devices.
function deviceOf(userAgent: string | null, t: TFunction): string {
  if (!userAgent) return t('settings.logins.unknownDevice');
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'macOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  const parts = [browser, system].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : t('settings.logins.unknownDevice');
}
