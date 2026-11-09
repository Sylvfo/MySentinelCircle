import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { requestOtp } from '../api/auth';
import { useAction } from '../useAction';

// The login reached from a SMS link: number, then code, nothing else. Someone
// who has no account has no password to look for.
export function SmsCodeLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const { busy: submitting, error, run } = useAction({ fallback: t('auth.errors.generic') });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { userId } = await requestOtp(phone.trim());
      navigate('/otp', { state: { userId, phone, next: '/a' } });
    });
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
