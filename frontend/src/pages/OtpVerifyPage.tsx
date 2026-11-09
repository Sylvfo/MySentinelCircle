import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestOtp, verifyOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { useAction } from '../useAction';

interface LocationState {
  userId: string;
  // Where to go after the code; set when the login came from a SMS link.
  next?: string;
  phone: string;
}

export function OtpVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applyToken } = useAuth();
  const { t } = useTranslation();
  const state = location.state as LocationState | null;

  const [code, setCode] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const { busy: submitting, error, run } = useAction({ fallback: t('auth.errors.invalidCode') });

  if (!state?.userId) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { accessToken } = await verifyOtp(state.userId, code);
      await applyToken(accessToken);
      navigate(state.next ?? '/new-password');
    });
  };

  const handleResend = () => {
    setInfo(null);
    void run(async () => {
      await requestOtp(state.phone);
      setInfo(t('auth.resent'));
    }, t('auth.errors.generic'));
  };

  return (
    <div className="auth-page">
      <h1>{t('auth.verifyTitle')}</h1>
      <p className="muted muted-small">
        {t('auth.otpSent', { phone: state.phone })}
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
        {info && <p className="muted muted-small">{info}</p>}
        <button type="submit" disabled={submitting}>
          {t('auth.validate')}
        </button>
      </form>
      <p className="switch-link">
        <button type="button" className="link-button" onClick={handleResend}>
          {t('auth.resend')}
        </button>
      </p>
    </div>
  );
}
