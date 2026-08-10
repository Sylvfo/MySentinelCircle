import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginEmail, requestOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

export function LoginPage() {
  const [mode, setMode] = useState<'password' | 'phone'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { applyToken } = useAuth();
  const navigate = useNavigate();

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await loginEmail(email, password);
      await applyToken(accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await requestOtp(phone);
      navigate('/otp', { state: { userId, phone } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>Connexion</h1>

      {mode === 'password' ? (
        <form onSubmit={handlePasswordSubmit}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Mot de passe
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            Se connecter
          </button>
        </form>
      ) : (
        <form onSubmit={handlePhoneSubmit}>
          <label>
            Numéro de téléphone
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
            Recevoir un code
          </button>
        </form>
      )}

      <p className="switch-link">
        <button
          type="button"
          className="google-btn-placeholder"
          style={{ width: '100%', border: 'none', marginBottom: '0.5rem' }}
          onClick={() => setMode(mode === 'password' ? 'phone' : 'password')}
        >
          {mode === 'password' ? 'Se connecter par téléphone (OTP)' : 'Se connecter par email + mot de passe'}
        </button>
      </p>

      <div className="auth-divider">ou</div>
      <p className="google-btn-placeholder">Google (bientôt disponible)</p>

      <p className="switch-link">
        Pas encore de compte ? <Link to="/signup">Créer un compte</Link>
      </p>
    </div>
  );
}
