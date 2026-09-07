import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signupEmail, signupGoogle } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

function suggestUsername(firstName: string): string {
  const base = firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  return `${base}${Math.floor(Math.random() * 10000)}`;
}

type Credential = { method: 'email'; email: string; password: string } | { method: 'google'; idToken: string };

export function SignupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [credential, setCredential] = useState<Credential | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userName, setUserName] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [phone, setPhone] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleStep1EmailNext = (e: FormEvent) => {
    e.preventDefault();
    setCredential({ method: 'email', email, password });
    setStep(2);
  };

  const handleGoogleCredential = (idToken: string) => {
    setCredential({ method: 'google', idToken });
    setStep(2);
  };

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    if (!usernameEdited) setUserName(suggestUsername(value));
  };

  const handleStep2Submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!credential) return;
    setError(null);
    setSubmitting(true);
    try {
      const result =
        credential.method === 'email'
          ? await signupEmail(
              firstName.trim(),
              lastName.trim() || undefined,
              userName.trim(),
              credential.email,
              credential.password,
              phone.trim() || undefined,
            )
          : await signupGoogle(
              firstName.trim(),
              lastName.trim() || undefined,
              userName.trim(),
              phone.trim() || undefined,
              credential.idToken,
            );

      if ('accessToken' in result) {
        await applyToken(result.accessToken);
        navigate('/dashboard');
        return;
      }
      navigate('/otp', { state: { userId: result.userId, phone, justSignedUp: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.signup'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
      </div>
      <h1>{t('auth.signupTitle')}</h1>

      {step === 1 ? (
        <>
          <form onSubmit={handleStep1EmailNext}>
            <label>
              {t('auth.email')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              {t('auth.password')}
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit">{t('auth.continue')}</button>
          </form>

          <div className="auth-divider">{t('common.or')}</div>
          <GoogleSignInButton
            onCredential={handleGoogleCredential}
            fallbackLabel={t('auth.googleSignup', { state: t('common.comingSoon') })}
          />
        </>
      ) : (
        <form onSubmit={handleStep2Submit}>
          <label>
            {t('auth.firstName')}
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => handleFirstNameChange(e.target.value)}
            />
          </label>
          <label>
            {t('auth.lastName')}
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label>
            {t('auth.username')}
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={userName}
              onChange={(e) => {
                setUsernameEdited(true);
                setUserName(e.target.value);
              }}
            />
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('auth.usernameHint')}</p>
          <label>
            {t('auth.phone')}
            <input
              type="tel"
              placeholder="+33612345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('auth.phoneHint')}</p>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {t('auth.continue')}
          </button>
          <p className="switch-link">
            <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none' }}>
              {t('auth.back')}
            </button>
          </p>
        </form>
      )}

      <p className="switch-link">
        {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
      </p>
    </div>
  );
}
