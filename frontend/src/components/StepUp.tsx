import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { stepUpPassword, stepUpGoogle, stepUpCodeRequest, stepUpCodeVerify, type Me } from '../api/user';
import { GoogleSignInButton } from './GoogleSignInButton';

type Method = 'password' | 'google' | 'code';

// Generic identity re-verification: proves it's still the account owner via
// ANY credential the account already has, not necessarily the specific one
// about to be changed (answers "I lost my old phone" — use password, Google,
// or a code to whichever channel is still accessible).
export function StepUpPanel({
  me,
  onVerified,
  onError,
}: {
  me: Me;
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<Method | null>(null);
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<'phone' | 'email' | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canPassword = me.hasPassword;
  const canGoogle = me.hasGoogle;
  const canPhone = !!(me.phone && me.phoneVerifiedAt);
  const canEmail = !!me.email;

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await stepUpPassword(password);
      onVerified();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogleCredential = async (idToken: string) => {
    setSubmitting(true);
    try {
      await stepUpGoogle(idToken);
      onVerified();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const requestCode = async (ch: 'phone' | 'email') => {
    setMethod('code');
    setSubmitting(true);
    try {
      await stepUpCodeRequest(ch);
      setChannel(ch);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await stepUpCodeVerify(code);
      onVerified();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (method === 'password') {
    return (
      <form onSubmit={submitPassword}>
        <label>
          {t('settings.currentPassword')}
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={submitting}>
          {t('auth.validate')}
        </button>
      </form>
    );
  }

  if (method === 'google') {
    return <GoogleSignInButton onCredential={onGoogleCredential} fallbackLabel={t('settings.stepUp.useGoogle')} />;
  }

  if (method === 'code') {
    if (!channel) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;
    return (
      <form onSubmit={submitCode}>
        <p>{channel === 'phone' ? t('settings.stepUp.codeSentPhone') : t('settings.stepUp.codeSentEmail')}</p>
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
        <button type="submit" disabled={submitting}>
          {t('auth.validate')}
        </button>
      </form>
    );
  }

  return (
    <div>
      <p>{t('settings.stepUp.prompt')}</p>
      <div className="row">
        {canPassword && (
          <button type="button" onClick={() => setMethod('password')}>
            {t('settings.stepUp.usePassword')}
          </button>
        )}
        {canGoogle && (
          <button type="button" onClick={() => setMethod('google')}>
            {t('settings.stepUp.useGoogle')}
          </button>
        )}
        {canPhone && (
          <button type="button" disabled={submitting} onClick={() => requestCode('phone')}>
            {t('settings.stepUp.useCodePhone')}
          </button>
        )}
        {canEmail && (
          <button type="button" disabled={submitting} onClick={() => requestCode('email')}>
            {t('settings.stepUp.useCodeEmail')}
          </button>
        )}
      </div>
    </div>
  );
}
