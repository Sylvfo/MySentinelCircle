import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '../components/PasswordInput';
import { linkGoogle, loginEmail, loginGoogle, loginPhone, requestOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { LegalLinks } from './legal/LegalPage';

interface LocationState {
  pendingGoogleIdToken?: string;
}

export function LoginPage() {
  // One field for both: an "@" means an email, anything else a phone number.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const pendingGoogleIdToken = (location.state as LocationState | null)?.pendingGoogleIdToken;

  const isEmail = identifier.includes('@');
  // "+41 79 123 45 67" → "+41791234567", as the backend expects.
  const phone = identifier.replace(/[\s.()-]/g, '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = isEmail
        ? await loginEmail(identifier.trim(), password)
        : await loginPhone(phone, password);
      await applyToken(accessToken);
      // Signing in with Google for the first time on an existing account:
      // link it now that we know who they are.
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

  // First time, or forgot the password: a code by SMS logs them in.
  const handleCodeRequest = async () => {
    setError(null);
    if (!identifier.trim() || isEmail) {
      setError(t('auth.smsCodeNeedsPhone'));
      return;
    }
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

      {pendingGoogleIdToken && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('auth.linkGooglePrompt')}</p>
      )}

      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.phoneOrEmail')}
          <input
            type="text"
            required
            autoComplete="username"
            placeholder={t('auth.phoneOrEmailPlaceholder')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <label>
          {t('auth.password')}
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {t('auth.login')}
        </button>
      </form>

      {/* Two ways in without the password: a code by SMS (phone), or the
          reset link by email (ForgotPasswordPage). */}
      <div className="login-help">
        <button type="button" className="link-button" disabled={submitting} onClick={handleCodeRequest}>
          {t('auth.getSmsCode')}
        </button>
        <Link to="/forgot-password">{t('auth.forgotPasswordEmail')}</Link>
      </div>

      <div className="auth-divider">{t('common.or')}</div>
      <GoogleSignInButton
        onCredential={handleGoogleCredential}
        fallbackLabel={t('auth.googleLogin', { state: t('common.comingSoon') })}
      />

      <p className="switch-link">
        {t('auth.noAccount')} <Link to="/signup">{t('auth.createAccount')}</Link>
      </p>
      <LegalLinks />
    </div>
  );
}
