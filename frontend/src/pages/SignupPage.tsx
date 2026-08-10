import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signupEmail } from '../api/auth';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function SignupPage() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await signupEmail(firstName.trim(), email, password, phone);
      navigate('/otp', { state: { userId, phone, justSignedUp: true } });
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
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.firstName')}
          <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
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
          {t('auth.continue')}
        </button>
      </form>

      <div className="auth-divider">{t('common.or')}</div>
      <p className="google-btn-placeholder">{t('auth.googleSignup', { state: t('common.comingSoon') })}</p>

      <p className="switch-link">
        {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
      </p>
    </div>
  );
}
