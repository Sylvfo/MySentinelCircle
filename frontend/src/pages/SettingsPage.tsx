import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  changePassword,
  fetchMe,
  requestAddPhone,
  requestEmailChange,
  updateProfile,
  uploadAvatar,
  verifyAddPhone,
  type Me,
} from '../api/user';
import { Modal } from '../components/Modal';
import { StepUpPanel } from '../components/StepUp';

export function SettingsPage() {
  const { t } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const reload = async () => {
    setError(null);
    try {
      setMe(await fetchMe());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;
  if (!me) return <p className="form-error">{error}</p>;

  return (
    <div>
      <h1>{t('settings.title')}</h1>
      {error && <p className="form-error">{error}</p>}

      <AvatarPanel me={me} onChange={reload} onError={setError} />
      <ProfileInfoPanel me={me} onChange={reload} onError={setError} />

      {(me.hasPassword || me.email) && (
        <section className="panel">
          <h2>{t('settings.security')}</h2>
          <div className="row">
            {me.hasPassword && (
              <button type="button" onClick={() => setShowPasswordModal(true)}>
                {t('settings.changePassword')}
              </button>
            )}
            {me.email && (
              <button type="button" onClick={() => setShowEmailModal(true)}>
                {t('settings.changeEmail.title')}
              </button>
            )}
          </div>
        </section>
      )}

      {showPasswordModal && (
        <Modal title={t('settings.changePassword')} onClose={() => setShowPasswordModal(false)}>
          <ChangePasswordForm onDone={() => setShowPasswordModal(false)} onError={setError} />
        </Modal>
      )}

      {showEmailModal && (
        <Modal title={t('settings.changeEmail.title')} onClose={() => setShowEmailModal(false)}>
          <ChangeEmailFlow me={me} onError={setError} />
        </Modal>
      )}

      {showPhoneModal && (
        <Modal title={t('settings.changePhone')} onClose={() => setShowPhoneModal(false)}>
          <ChangePhoneFlow
            me={me}
            onChange={() => {
              reload();
              setShowPhoneModal(false);
            }}
            onError={setError}
          />
        </Modal>
      )}

      <section className="panel">
        <h2>{t('settings.editable')}</h2>
        <EditableTextField
          label={t('auth.lastName')}
          value={me.lastName ?? ''}
          onSave={(v) => updateProfile({ lastName: v })}
          onSaved={reload}
          onError={setError}
        />
        <EditableToggle
          label={t('settings.isMajor')}
          value={me.isMajor}
          onSave={(v) => updateProfile({ isMajor: v })}
          onSaved={reload}
          onError={setError}
        />
        <EditableTextField
          label={t('settings.publicStatus')}
          value={me.publicStatus ?? ''}
          onSave={(v) => updateProfile({ publicStatus: v })}
          onSaved={reload}
          onError={setError}
        />
        {me.phone ? (
          <div>
            <label>{t('settings.phone')}</label>
            <p>{me.phone}</p>
            <button type="button" onClick={() => setShowPhoneModal(true)}>
              {t('settings.changePhone')}
            </button>
          </div>
        ) : (
          <AddPhonePanel onChange={reload} onError={setError} />
        )}
      </section>
    </div>
  );
}

function ProfileInfoPanel({ me, onChange, onError }: { me: Me; onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <h2>{t('settings.profile')}</h2>
      <EditableTextField
        label={t('auth.firstName')}
        value={me.firstName}
        onSave={(v) => updateProfile({ firstName: v })}
        onSaved={onChange}
        onError={onError}
        required
      />

      {me.userName ? (
        <div>
          <label>{t('auth.username')}</label>
          <p>{me.userName}</p>
        </div>
      ) : (
        <EditableTextField
          label={t('auth.username')}
          value=""
          onSave={(v) => updateProfile({ userName: v })}
          onSaved={onChange}
          onError={onError}
          hint={t('auth.usernameHint')}
          minLength={3}
          maxLength={30}
          required
        />
      )}

      <div>
        <label>{t('settings.status')}</label>
        <p>{me.status}</p>
      </div>
      <div>
        <label>{t('settings.userType')}</label>
        <p>{me.userType}</p>
      </div>
      <div>
        <label>{t('settings.createdAt')}</label>
        <p>{new Date(me.createdAt).toLocaleString()}</p>
      </div>
      <div>
        <label>{t('settings.updatedAt')}</label>
        <p>{new Date(me.updatedAt).toLocaleString()}</p>
      </div>
    </section>
  );
}

function EditableTextField({
  label,
  value: initialValue,
  onSave,
  onSaved,
  onError,
  hint,
  required,
  minLength,
  maxLength,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(value.trim());
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="row" onSubmit={submit}>
      <label>
        {label}
        <input
          value={value}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
      {hint && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{hint}</p>}
    </form>
  );
}

function EditableToggle({
  label,
  value: initialValue,
  onSave,
  onSaved,
  onError,
}: {
  label: string;
  value: boolean;
  onSave: (value: boolean) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(value);
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="row" onSubmit={submit}>
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} />
        {label}
      </label>
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
    </form>
  );
}

function AvatarPanel({ me, onChange, onError }: { me: Me; onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadAvatar(file);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  return (
    <section className="panel">
      <h2>{t('settings.avatar')}</h2>
      {me.avatarPath && (
        <img
          src={`${apiUrl}/uploads/avatars/${me.avatarPath}`}
          alt=""
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', marginBottom: '0.5rem' }}
        />
      )}
      <div className="row">
        <input type="file" accept="image/*" disabled={submitting} onChange={onFileChange} />
      </div>
    </section>
  );
}

function AddPhonePanel({ onChange, onError }: { onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestAddPhone(phone.trim());
      setCodeSent(true);
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
      await verifyAddPhone(code.trim());
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <label>{t('settings.addPhone')}</label>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('auth.phoneHint')}</p>

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

function ChangeEmailFlow({ me, onError }: { me: Me; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [verified, setVerified] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestEmailChange(newEmail.trim());
      setSent(true);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!verified) {
    return <StepUpPanel me={me} onVerified={() => setVerified(true)} onError={onError} />;
  }

  if (sent) {
    return <p>{t('settings.changeEmail.sent')}</p>;
  }

  return (
    <form onSubmit={submit}>
      <label>
        {t('settings.changeEmail.newEmail')}
        <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
      </label>
      <button type="submit" disabled={submitting}>
        {t('settings.changeEmail.send')}
      </button>
    </form>
  );
}

function ChangePhoneFlow({
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

function ChangePasswordForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPassword !== confirmPassword) {
      setLocalError(t('settings.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      onDone();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setLocalError(message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
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
      <label>
        {t('settings.newPasswordLabel')}
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <label>
        {t('settings.confirmNewPassword')}
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>
      {localError && <p className="form-error">{localError}</p>}
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
    </form>
  );
}
