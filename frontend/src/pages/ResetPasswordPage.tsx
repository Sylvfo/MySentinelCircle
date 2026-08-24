import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmPasswordReset } from '../api/auth';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <h1>{t('auth.resetTitle')}</h1>
        <p className="form-error">{t('auth.resetMissingToken')}</p>
        <p className="switch-link">
          <Link to="/forgot-password">{t('auth.forgotSubmit')}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
      </div>
      <h1>{t('auth.resetTitle')}</h1>

      {done ? (
        <>
          <p>{t('auth.resetDone')}</p>
          <p className="switch-link">
            <button type="button" onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </button>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            {t('auth.newPassword')}
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {t('auth.resetSubmit')}
          </button>
        </form>
      )}
    </div>
  );
}
