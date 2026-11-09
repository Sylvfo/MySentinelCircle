import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmPasswordReset } from '../api/auth';
import { LanguageRow, NewPasswordForm } from '../components/AuthFields';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!token) {
    return (
      <div className="auth-page">
        <h1>{t('auth.resetTitle')}</h1>
        <p className="form-error">{t('auth.resetMissingToken')}</p>
        <p className="switch-link">
          <Link to="/forgot-password">{t('auth.forgotSubmit')}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <LanguageRow />
      <h1>{t('auth.resetTitle')}</h1>

      {done ? (
        <>
          <p>{t('auth.resetDone')}</p>
          <p className="switch-link">
            <button type="button" onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </button>
          </p>
        </>
      ) : (
        <NewPasswordForm
          onSubmit={async (password) => {
            await confirmPasswordReset(token, password);
            setDone(true);
          }}
        />
      )}
    </div>
  );
}
