import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../api/auth';
import { useAction } from '../useAction';
import { EmailField, LanguageRow } from '../components/AuthFields';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { t } = useTranslation();
  const { busy, error, run } = useAction({ fallback: t('auth.errors.generic') });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestPasswordReset(email);
      setSent(true);
    });
  };

  return (
    <div className="auth-page">
      <LanguageRow />
      <h1>{t('auth.forgotTitle')}</h1>

      {sent ? (
        <p>{t('auth.forgotSent')}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <EmailField value={email} onChange={setEmail} />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {t('auth.forgotSubmit')}
          </button>
        </form>
      )}

      <p className="switch-link">
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </p>
    </div>
  );
}
