import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmEmailChange } from '../api/user';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'done' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    confirmEmailChange(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
        setStatus('error');
      });
  }, [token, t]);

  return (
    <div className="auth-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
      </div>
      <h1>{t('settings.changeEmail.confirmTitle')}</h1>

      {status === 'pending' && <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>}

      {status === 'done' && (
        <>
          <p>{t('settings.changeEmail.confirmDone')}</p>
          <p className="switch-link">
            <button type="button" onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </button>
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="form-error">{error ?? t('settings.changeEmail.confirmMissingToken')}</p>
          <p className="switch-link">
            <Link to="/settings">{t('settings.title')}</Link>
          </p>
        </>
      )}
    </div>
  );
}
