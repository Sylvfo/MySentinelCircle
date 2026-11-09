import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  changePassword,
  deleteAccount,
  requestAddPhone,
  requestEmailChange,
  removeAvatar,
  uploadAvatar,
  verifyAddPhone,
  type Me,
} from '../api/user';
import { StepUpPanel } from './StepUp';
import { useAuth } from '../auth/AuthContext';
import { SentinelIcon } from './SentinelIcon';
import { useAvatarUrl } from '../avatars';
import { useAction } from '../useAction';
import { EmailField, PasswordField } from './AuthFields';

// My profile photo — private: only the people linked to me can see it (the
// file is fetched through GET /user/:id/avatar, see avatars.ts).
export function AvatarPanel({ me, onChange, onError }: { me: Me; onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const { busy: submitting, run: runAction } = useAction({ onError });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUrl = useAvatarUrl(me.id, me.avatarPath);

  const run = (action: () => Promise<unknown>) =>
    runAction(async () => {
      await action();
      onChange();
      void refreshUser();
    });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(() => uploadAvatar(file));
  };

  return (
    <section className={`panel avatar-panel${me.pausedForMe || me.pausedForOthers ? ' is-paused' : ''}`}>
      <h2>{t('settings.avatar')}</h2>
      <div className="avatar-panel-body">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="avatar-panel-photo" />
        ) : (
          <span className="avatar-panel-photo empty" aria-hidden="true">
            <SentinelIcon size={56} />
          </span>
        )}
        <div className="avatar-panel-actions">
          <p className="form-hint">{t('settings.avatarHint')}</p>
          <div className="row">
            <button type="button" disabled={submitting} onClick={() => fileInputRef.current?.click()}>
              {me.avatarPath ? t('settings.avatarChange') : t('settings.avatarAdd')}
            </button>
            {me.avatarPath && (
              <button type="button" className="ghost" disabled={submitting} onClick={() => run(removeAvatar)}>
                {t('settings.avatarRemove')}
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={submitting}
        onChange={onFileChange}
      />
    </section>
  );
}

export function AddPhonePanel({ onChange, onError }: { onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const { busy: submitting, run } = useAction({ onError });

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestAddPhone(phone.trim());
      setCodeSent(true);
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await verifyAddPhone(code.trim());
      onChange();
    });
  };

  return (
    <div>
      <label>{t('settings.addPhone')}</label>
      <p className="muted muted-small">{t('auth.phoneHint')}</p>

      {!codeSent ? (
        <form className="row" onSubmit={submitPhone}>
          <input
            type="tel"
            required
            placeholder="+33612345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {t('auth.requestCode')}
          </button>
        </form>
      ) : (
        <form className="row" onSubmit={submitCode}>
          <input
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {t('auth.validate')}
          </button>
        </form>
      )}
    </div>
  );
}

export function ChangeEmailFlow({ me, onError }: { me: Me; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [verified, setVerified] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy: submitting, run } = useAction({ onError });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestEmailChange(newEmail.trim());
      setSent(true);
    });
  };

  if (!verified) {
    return <StepUpPanel me={me} onVerified={() => setVerified(true)} onError={onError} />;
  }

  if (sent) {
    return <p>{t('settings.changeEmail.sent')}</p>;
  }

  return (
    <form onSubmit={submit}>
      <EmailField label={t('settings.changeEmail.newEmail')} value={newEmail} onChange={setNewEmail} />
      <button type="submit" disabled={submitting}>
        {t('settings.changeEmail.send')}
      </button>
    </form>
  );
}

export function ChangePhoneFlow({
  me,
  onChange,
  onError,
}: {
  me: Me;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const [verified, setVerified] = useState(false);

  if (!verified) {
    return <StepUpPanel me={me} onVerified={() => setVerified(true)} onError={onError} />;
  }

  return <AddPhonePanel onChange={onChange} onError={onError} />;
}

// Backend refusals (account-deletion.service.ts), shown translated instead of raw.
const DELETE_ERRORS: Record<string, string> = {
  'An alert about you is in progress: your account can be deleted once it is over': 'settings.delete.ownAlert',
  'You are a Lead on an alert in progress: leave it before deleting your account': 'settings.delete.leadOnAlert',
};

export function DeleteAccountPanel({
  me,
  onDeleted,
  onError,
}: {
  me: Me;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'verify' | 'confirm'>('idle');
  const [typed, setTyped] = useState('');
  const { busy: submitting, run } = useAction({
    onError: (message) => onError(DELETE_ERRORS[message] ? t(DELETE_ERRORS[message]) : message),
  });
  const word = t('settings.delete.word');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await deleteAccount();
      onDeleted();
    });
  };

  return (
    <section className="panel">
      <h2>{t('settings.delete.title')}</h2>
      <p className="form-hint">{t('settings.delete.warning')}</p>
      {step === 'idle' && (
        <button type="button" onClick={() => setStep('verify')}>
          {t('settings.delete.start')}
        </button>
      )}
      {step === 'verify' && <StepUpPanel me={me} onVerified={() => setStep('confirm')} onError={onError} />}
      {step === 'confirm' && (
        <form onSubmit={submit}>
          <label>
            {t('settings.delete.confirm', { word })}
            <input required value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <button type="submit" disabled={submitting || typed.trim() !== word}>
            {t('settings.delete.submit')}
          </button>
        </form>
      )}
    </section>
  );
}

export function ChangePasswordForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { busy: submitting, run } = useAction({
    onError: (message) => {
      setLocalError(message);
      onError(message);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPassword !== confirmPassword) {
      setLocalError(t('settings.passwordMismatch'));
      return;
    }
    void run(async () => {
      await changePassword(currentPassword, newPassword);
      onDone();
    });
  };

  return (
    <form onSubmit={submit}>
      <label>
        {t('settings.currentPassword')}
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <PasswordField label={t('settings.newPasswordLabel')} value={newPassword} onChange={setNewPassword} />
      <PasswordField label={t('settings.confirmNewPassword')} value={confirmPassword} onChange={setConfirmPassword} />
      {localError && <p className="form-error">{localError}</p>}
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
    </form>
  );
}
