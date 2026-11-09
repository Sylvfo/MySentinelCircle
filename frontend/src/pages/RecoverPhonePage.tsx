import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPhoneRecovery, verifyPhoneRecovery } from '../api/auth';
import { useAction } from '../useAction';
import { LanguageRow } from '../components/AuthFields';

// "+41 79 123 45 67" → "+41791234567", as the backend expects.
const cleanPhone = (value: string) => value.replace(/[\s.()-]/g, '');

// Backend refusals worth saying in the person's language.
const ERRORS: Record<string, string> = {
  'No pending code': 'auth.recover.noCode',
  'Invalid code': 'auth.recover.invalidCode',
  'This number already has an account': 'auth.recover.numberTaken',
  'Code expired, request a new one': 'auth.recover.askAgain',
  'Too many attempts, request a new code': 'auth.recover.askAgain',
};

// Lost phone (PhoneRecoveryService): old number + new one, two people of
// the 1st circle confirm in the app, then the code sent to the new number
// finishes it. Signed out on every device, the person logs in again.
export function RecoverPhonePage() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'ask' | 'code' | 'done'>('ask');
  const [oldPhone, setOldPhone] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [asked, setAsked] = useState(false);
  const { busy, error, setError, run } = useAction({ fallback: t('auth.errors.generic') });

  const ask = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestPhoneRecovery(cleanPhone(oldPhone), cleanPhone(newPhone));
      setAsked(true);
      setStage('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await verifyPhoneRecovery(cleanPhone(newPhone), code.trim());
      setStage('done');
    });
  };

  const shownError = error && (ERRORS[error] ? t(ERRORS[error]) : error);

  return (
    <div className="auth-page">
      <LanguageRow />
      <h1>{t('auth.recover.title')}</h1>

      {stage === 'ask' && (
        <form onSubmit={ask}>
          <p className="muted">{t('auth.recover.intro')}</p>
          <label>
            {t('auth.recover.oldPhone')}
            <input type="tel" required autoComplete="off" value={oldPhone} onChange={(e) => setOldPhone(e.target.value)} />
          </label>
          <label>
            {t('auth.recover.newPhone')}
            <input type="tel" required autoComplete="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </label>
          {shownError && <p className="form-error">{shownError}</p>}
          <button type="submit" disabled={busy}>
            {t('auth.recover.submit')}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError(null);
              setStage('code');
            }}
          >
            {t('auth.recover.haveCode')}
          </button>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={verify}>
          {asked && <p>{t('auth.recover.asked')}</p>}
          {!asked && (
            <label>
              {t('auth.recover.newPhone')}
              <input type="tel" required autoComplete="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </label>
          )}
          <label>
            {t('auth.otpLabel')}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {shownError && <p className="form-error">{shownError}</p>}
          <button type="submit" disabled={busy}>
            {t('auth.validate')}
          </button>
          <p className="muted muted-small">{t('auth.recover.codeHint')}</p>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError(null);
              setStage('ask');
            }}
          >
            {t('auth.recover.again')}
          </button>
        </form>
      )}

      {stage === 'done' && <p>{t('auth.recover.done')}</p>}

      <p className="switch-link">
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </p>
    </div>
  );
}
