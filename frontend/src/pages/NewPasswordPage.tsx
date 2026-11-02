import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setPassword } from '../api/user';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

// Reached right after an SMS code, whose step-up authorizes the change.
export function NewPasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setPassword(newPassword);
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>{t('auth.newPasswordTitle')}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.newPassword')}
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {t('auth.resetSubmit')}
        </button>
      </form>
      {user?.hasPassword && (
        <p className="switch-link">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
          >
            {t('auth.keepPassword')}
          </button>
        </p>
      )}
    </div>
  );
}
