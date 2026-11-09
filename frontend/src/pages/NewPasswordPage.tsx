import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setPassword } from '../api/user';
import { useAuth } from '../auth/AuthContext';
import { NewPasswordForm } from '../components/AuthFields';

// Reached right after an SMS code, whose step-up authorizes the change.
export function NewPasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="auth-page">
      <h1>{t('auth.newPasswordTitle')}</h1>
      <NewPasswordForm
        onSubmit={async (password) => {
          await setPassword(password);
          await refreshUser();
          navigate('/dashboard');
        }}
      />
      {user?.hasPassword && (
        <p className="switch-link">
          <button type="button" className="link-button" onClick={() => navigate('/dashboard')}>
            {t('auth.keepPassword')}
          </button>
        </p>
      )}
    </div>
  );
}
