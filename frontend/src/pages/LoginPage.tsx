import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { linkGoogle, loginEmail, loginGoogle, loginPhone, requestOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

interface LocationState {
  pendingGoogleIdToken?: string;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const pendingGoogleIdToken = (location.state as LocationState | null)?.pendingGoogleIdToken;
  const [mode, setMode] = useState<'phone' | 'password'>(pendingGoogleIdToken ? 'password' : 'phone');

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await loginEmail(email, password);
      await applyToken(accessToken);
      if (pendingGoogleIdToken) {
        await linkGoogle(pendingGoogleIdToken).catch((linkErr) => {
          console.error('linkGoogle failed:', linkErr);
        });
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.login'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await loginGoogle(idToken);
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
      const { accessToken } = await loginPhone(phone.trim(), password);
      await applyToken(accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.login'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeRequest = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await requestOtp(phone.trim());
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

      {pendingGoogleIdToken && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('auth.linkGooglePrompt')}</p>
      )}

      {mode === 'phone' ? (
        <>
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
            <label>
              {t('auth.password')}
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {t('auth.login')}
            </button>
          </form>
          <p className="switch-link">
            <button
              type="button"
              disabled={submitting || !phone.trim()}
              onClick={handleCodeRequest}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              {t('auth.firstTimeOrForgot')}
            </button>
          </p>
          <p className="switch-link">
            <button
              type="button"
              className="google-btn-placeholder"
              style={{ width: '100%', border: 'none' }}
              onClick={() => setMode('password')}
            >
              {t('auth.justLooking')}
            </button>
          </p>
        </>
      ) : (
        <>
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
            <p className="switch-link">
              <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
            </p>
          </form>

          <div className="auth-divider">{t('common.or')}</div>
          <GoogleSignInButton
            onCredential={handleGoogleCredential}
            fallbackLabel={t('auth.googleLogin', { state: t('common.comingSoon') })}
          />

          <p className="switch-link">
            {t('auth.noAccount')} <Link to="/signup">{t('auth.createAccount')}</Link>
          </p>
          <p className="switch-link">
            <button
              type="button"
              className="google-btn-placeholder"
              style={{ width: '100%', border: 'none' }}
              onClick={() => setMode('phone')}
            >
              {t('auth.backToPhone')}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
