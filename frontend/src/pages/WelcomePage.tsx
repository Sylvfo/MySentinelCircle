import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { completeProfile, requestEmailChange } from '../api/user';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <p className="page-loading">Chargement…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (step === 'profile' && user.userType !== 'ONLY_SMS') return <Navigate to="/dashboard" replace />;

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await completeProfile(firstName.trim(), password, lastName.trim() || undefined);
      setStep('email');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestEmailChange(email.trim());
      setStep('emailSent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'profile') {
    return (
      <div className="auth-page">
        <h1>{t('welcome.title')}</h1>
        {user.firstName && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('welcome.alreadySentinel')}</p>
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('welcome.emailHint')}</p>
          <form onSubmit={handleEmailSubmit}>
            <label>
              {t('auth.email')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {t('welcome.emailSubmit')}
            </button>
          </form>
          <p className="switch-link">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              {t('welcome.later')}
            </button>
          </p>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('welcome.emailSent', { email })}</p>
          <button type="button" onClick={() => navigate('/dashboard')}>
            {t('auth.continue')}
          </button>
        </>
      )}
    </div>
  );
}
