import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '../components/PasswordInput';
import { linkGoogle, loginEmail, loginGoogle, loginPhone, requestOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { useAction } from '../useAction';
import { LanguageRow } from '../components/AuthFields';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { LegalLinks } from './legal/LegalPage';

interface LocationState {
  pendingGoogleIdToken?: string;
}

export function LoginPage() {
  // One field for both: an "@" means an email, anything else a phone number.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { busy: submitting, error, setError, run } = useAction({ fallback: t('auth.errors.login') });
  const pendingGoogleIdToken = (location.state as LocationState | null)?.pendingGoogleIdToken;

  const isEmail = identifier.includes('@');
  // "+41 79 123 45 67" → "+41791234567", as the backend expects.
  const phone = identifier.replace(/[\s.()-]/g, '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
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
    });
  };

  const handleGoogleCredential = (idToken: string) => {
    void run(async () => {
      const { accessToken } = await loginGoogle(idToken);
      await applyToken(accessToken);
      navigate('/dashboard');
    });
  };

  // First time, or forgot the password: a code by SMS logs them in.
  const handleCodeRequest = () => {
    if (!identifier.trim() || isEmail) {
      setError(t('auth.smsCodeNeedsPhone'));
      return;
    }
    void run(async () => {
      const { userId } = await requestOtp(phone);
      navigate('/otp', { state: { userId, phone } });
    }, t('auth.errors.generic'));
  };

  return (
    <div className="auth-page">
      <LanguageRow />
      <h1>{t('auth.loginTitle')}</h1>

      {pendingGoogleIdToken && (
        <p className="muted muted-small">{t('auth.linkGooglePrompt')}</p>
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

      {/* Ways in without the password: a code by SMS (phone), the reset
          link by email (ForgotPasswordPage), or, phone lost, the 1st circle
          vouching for them (RecoverPhonePage). */}
      <div className="login-help">
        <button type="button" className="link-button" disabled={submitting} onClick={handleCodeRequest}>
          {t('auth.getSmsCode')}
        </button>
        <Link to="/forgot-password">{t('auth.forgotPasswordEmail')}</Link>
        <Link to="/recover-phone">{t('auth.recover.link')}</Link>
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
