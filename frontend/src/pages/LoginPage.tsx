import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginEmail, requestOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function LoginPage() {
  const [mode, setMode] = useState<'password' | 'phone'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await loginEmail(email, password);
      await applyToken(accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.login'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await requestOtp(phone);
      navigate('/otp', { state: { userId, phone } });
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
      <h1>{t('auth.loginTitle')}</h1>

      {mode === 'password' ? (
        <form onSubmit={handlePasswordSubmit}>
          <label>
            {t('auth.email')}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            {t('auth.password')}
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {t('auth.login')}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePhoneSubmit}>
          <label>
            {t('auth.phone')}
            <input
              type="tel"
              required
              placeholder="+33612345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {t('auth.requestCode')}
          </button>
        </form>
      )}

      <p className="switch-link">
        <button
          type="button"
          className="google-btn-placeholder"
          style={{ width: '100%', border: 'none', marginBottom: '0.5rem' }}
          onClick={() => setMode(mode === 'password' ? 'phone' : 'password')}
        >
          {mode === 'password' ? t('auth.switchToPhone') : t('auth.switchToPassword')}
        </button>
      </p>

      <div className="auth-divider">{t('common.or')}</div>
      <p className="google-btn-placeholder">{t('auth.googleLogin', { state: t('common.comingSoon') })}</p>

      <p className="switch-link">
        {t('auth.noAccount')} <Link to="/signup">{t('auth.createAccount')}</Link>
      </p>
    </div>
  );
}
