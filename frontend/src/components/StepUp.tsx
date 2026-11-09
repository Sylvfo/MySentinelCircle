import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAction } from '../useAction';
import { stepUpPassword, stepUpGoogle, stepUpCodeRequest, stepUpCodeVerify, type Me } from '../api/user';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Loading } from './Loading';

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
  const { busy: submitting, run } = useAction({ onError });

  const canPassword = me.hasPassword;
  const canGoogle = me.hasGoogle;
  const canPhone = !!(me.phone && me.phoneVerifiedAt);
  const canEmail = !!me.email;

  // Proven with one credential: the change can go on.
  const verify = (check: () => Promise<unknown>) =>
    void run(async () => {
      await check();
      onVerified();
    });

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    verify(() => stepUpPassword(password));
  };

  const onGoogleCredential = (idToken: string) => verify(() => stepUpGoogle(idToken));

  const requestCode = (ch: 'phone' | 'email') => {
    setMethod('code');
    void run(async () => {
      await stepUpCodeRequest(ch);
      setChannel(ch);
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    verify(() => stepUpCodeVerify(code));
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
    if (!channel) return <Loading />;
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
