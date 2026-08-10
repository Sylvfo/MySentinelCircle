import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestOtp, verifyOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

interface LocationState {
  userId: string;
  phone: string;
  justSignedUp?: boolean;
}

export function OtpVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applyToken } = useAuth();
  const { t } = useTranslation();
  const state = location.state as LocationState | null;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!state?.userId) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await verifyOtp(state.userId, code);
      await applyToken(accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.invalidCode'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    try {
      await requestOtp(state.phone);
      setInfo(t('auth.resent'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    }
  };

  return (
    <div className="auth-page">
      <h1>{t('auth.verifyTitle')}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        {state.justSignedUp
          ? t('auth.otpSentSignup', { phone: state.phone })
          : t('auth.otpSent', { phone: state.phone })}
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.otpLabel')}
          <input
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {info && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{info}</p>}
        <button type="submit" disabled={submitting}>
          {t('auth.validate')}
        </button>
      </form>
      <p className="switch-link">
        <button
          type="button"
          onClick={handleResend}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
        >
          {t('auth.resend')}
        </button>
      </p>
    </div>
  );
}
