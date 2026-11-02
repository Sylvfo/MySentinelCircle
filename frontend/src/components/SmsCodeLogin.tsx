import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { requestOtp } from '../api/auth';
import { ApiError } from '../api/client';

// The login reached from a SMS link: number, then code, nothing else. Someone
// who has no account has no password to look for.
export function SmsCodeLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await requestOtp(phone.trim());
      navigate('/otp', { state: { userId, phone, next: '/a' } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>MySentinelCircle</h1>
      <form onSubmit={submit}>
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
          {t('sentinelHome.sendCode')}
        </button>
      </form>
      <p className="switch-link">
        <Link to="/login">{t('sentinelHome.hasPassword')}</Link>
      </p>
    </div>
  );
}
