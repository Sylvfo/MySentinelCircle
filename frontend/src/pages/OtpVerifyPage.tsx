import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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
      setError(err instanceof ApiError ? err.message : 'Code invalide');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    try {
      await requestOtp(state.phone);
      setInfo('Nouveau code envoyé.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  };

  return (
    <div className="auth-page">
      <h1>Vérification</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        {state.justSignedUp ? 'Un code a été envoyé au ' : 'Code envoyé au '}
        {state.phone}.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Code à 6 chiffres
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
          Valider
        </button>
      </form>
      <p className="switch-link">
        <button
          type="button"
          onClick={handleResend}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
        >
          Renvoyer le code
        </button>
      </p>
    </div>
  );
}
