import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../api/auth';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
      </div>
      <h1>{t('auth.forgotTitle')}</h1>

      {sent ? (
        <p>{t('auth.forgotSent')}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            {t('auth.email')}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {t('auth.forgotSubmit')}
          </button>
        </form>
      )}

      <p className="switch-link">
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </p>
    </div>
  );
}
