import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { completeProfile, requestEmailChange } from '../api/user';
import { useAuth } from '../auth/AuthContext';
import { useAction } from '../useAction';
import { EmailField, PasswordField } from '../components/AuthFields';

export function WelcomePage() {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [step, setStep] = useState<'profile' | 'email' | 'emailSent'>('profile');
  const [editedFirstName, setFirstName] = useState<string | null>(null);
  const firstName = editedFirstName ?? user?.firstName ?? '';
  const [password, setPassword] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const { busy: submitting, error, run } = useAction({ fallback: t('auth.errors.generic') });

  if (loading) return <p className="page-loading">{t('common.loading')}</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (step === 'profile' && user.userType !== 'ONLY_SMS') return <Navigate to="/dashboard" replace />;

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await completeProfile(firstName.trim(), password, lastName.trim() || undefined);
      setStep('email');
      await refreshUser();
    });
  };

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestEmailChange(email.trim());
      setStep('emailSent');
    });
  };

  if (step === 'profile') {
    return (
      <div className="auth-page">
        <h1>{t('welcome.title')}</h1>
        {user.firstName && (
          <p className="muted muted-small">{t('welcome.alreadySentinel')}</p>
        )}
        <form onSubmit={handleProfileSubmit}>
          <label>
            {t('auth.firstName')}
            <input required maxLength={80} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label>
            {t('auth.lastName')}
            <input maxLength={80} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <PasswordField label={t('auth.password')} value={password} onChange={setPassword} />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting || !firstName.trim()}>
            {t('auth.continue')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>{t('welcome.emailTitle')}</h1>
      {step === 'email' ? (
        <>
          <p className="muted muted-small">{t('welcome.emailHint')}</p>
          <form onSubmit={handleEmailSubmit}>
            <EmailField value={email} onChange={setEmail} />
            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {t('welcome.emailSubmit')}
            </button>
          </form>
          <p className="switch-link">
            <button type="button" className="link-button" onClick={() => navigate('/dashboard')}>
              {t('welcome.later')}
            </button>
          </p>
        </>
      ) : (
        <>
          <p className="muted muted-small">{t('welcome.emailSent', { email })}</p>
          <button type="button" onClick={() => navigate('/dashboard')}>
            {t('auth.continue')}
          </button>
        </>
      )}
    </div>
  );
}
