import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  changePassword,
  deleteAccount,
  devSetHasPaid,
  fetchMe,
  getMyDeathNotice,
  requestAddPhone,
  requestEmailChange,
  setDeathNoticeRecipients,
  updateMyDeathNotice,
  removeAvatar,
  updateProfile,
  uploadAvatar,
  verifyAddPhone,
  type DeathNotice,
  type Me,
} from '../api/user';
import { Modal } from '../components/Modal';
import { StepUpPanel } from '../components/StepUp';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../auth/AuthContext';
import { SentinelIcon } from '../components/SentinelIcon';
import { useAvatarUrl } from '../avatars';

export function SettingsPage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
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
    void reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;
  if (!me) return <p className="form-error">{error}</p>;

  return (
    <div>
      <h1>{t('settings.title')}</h1>
      {error && <p className="form-error">{error}</p>}

      <AvatarPanel me={me} onChange={reload} onError={setError} />
      <ProfileInfoPanel me={me} onChange={reload} onError={setError} />

      <section className="panel">
        <h2>{t('common.language')}</h2>
        <LanguageSwitcher />
      </section>

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
              void reload();
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
        <EditableToggle
          label={t('settings.allowMessagingByDefault')}
          value={me.allowMessagingByDefault}
          onSave={(v) => updateProfile({ allowMessagingByDefault: v })}
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

      <DeathNoticePanel onError={setError} />

      {import.meta.env.DEV && (
        <section className="panel">
          <h2>{t('settings.dev.title')}</h2>
          <p className="form-hint">{t('settings.dev.hasPaidHint')}</p>
          <EditableToggle
            label={t('settings.dev.hasPaid')}
            value={me.hasPaid}
            onSave={(v) => devSetHasPaid(v)}
            onSaved={reload}
            onError={setError}
          />
        </section>
      )}

      <DeleteAccountPanel me={me} onDeleted={logout} onError={setError} />

      <section className="panel">
        <button type="button" className="ghost" onClick={logout}>
          {t('nav.logout')}
        </button>
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

// My profile photo — private: only the people linked to me can see it (the
// file is fetched through GET /user/:id/avatar, see avatars.ts).
function AvatarPanel({ me, onChange, onError }: { me: Me; onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUrl = useAvatarUrl(me.id, me.avatarPath);

  const run = async (action: () => Promise<unknown>) => {
    setSubmitting(true);
    try {
      await action();
      onChange();
      void refreshUser();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(() => uploadAvatar(file));
  };

  return (
    <section className="panel avatar-panel">
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

// Prepared while alive: the announcement broadcast to opted-in Sentinels
// once a death is confirmed (see SentinelService.confirmDeath), and who
// among them is notified, each with an optional personal message.
function DeathNoticePanel({ onError }: { onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<DeathNotice | null>(null);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Record<string, { notify: boolean; personalMessage: string }>>({});
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingRecipients, setSavingRecipients] = useState(false);

  const reload = async () => {
    try {
      const data = await getMyDeathNotice();
      setNotice(data);
      setMessage(data.announcementMessage);
      setSelected(
        Object.fromEntries(
          data.recipients.map((r) => [
            r.linkId,
            { notify: r.notifyOnDeath, personalMessage: r.personalMessage ?? '' },
          ]),
        ),
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!notice) return null;

  const saveMessage = async (e: FormEvent) => {
    e.preventDefault();
    setSavingMessage(true);
    try {
      await updateMyDeathNotice(message.trim());
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSavingMessage(false);
    }
  };

  const saveRecipients = async (e: FormEvent) => {
    e.preventDefault();
    setSavingRecipients(true);
    try {
      const recipients = Object.entries(selected)
        .filter(([, v]) => v.notify)
        .map(([linkId, v]) => ({ linkId, personalMessage: v.personalMessage.trim() || undefined }));
      const data = await setDeathNoticeRecipients(recipients);
      setSelected(
        Object.fromEntries(
          data.recipients.map((r) => [
            r.linkId,
            { notify: r.notifyOnDeath, personalMessage: r.personalMessage ?? '' },
          ]),
        ),
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSavingRecipients(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('settings.deathNotice.title')}</h2>
      <p style={{ color: 'var(--text-muted)' }}>{t('settings.deathNotice.intro')}</p>

      <form onSubmit={saveMessage}>
        <label>
          {t('settings.deathNotice.announcementLabel')}
          <textarea
            rows={4}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <button type="submit" disabled={savingMessage}>
          {t('common.save')}
        </button>
      </form>

      <form onSubmit={saveRecipients}>
        <h3>{t('settings.deathNotice.recipientsTitle')}</h3>
        {notice.recipients.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('settings.deathNotice.noRecipients')}</p>
        ) : (
          notice.recipients.map((r) => (
            <div key={r.linkId} className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected[r.linkId]?.notify ?? false}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      [r.linkId]: { ...prev[r.linkId], notify: e.target.checked },
                    }))
                  }
                />
                {r.sentinelLabel}
              </label>
              <input
                type="text"
                placeholder={t('settings.deathNotice.personalMessagePlaceholder')}
                maxLength={500}
                value={selected[r.linkId]?.personalMessage ?? ''}
                disabled={!selected[r.linkId]?.notify}
                onChange={(e) =>
                  setSelected((prev) => ({
                    ...prev,
                    [r.linkId]: { ...prev[r.linkId], personalMessage: e.target.value },
                  }))
                }
              />
            </div>
          ))
        )}
        <button type="submit" disabled={savingRecipients || notice.recipients.length === 0}>
          {t('common.save')}
        </button>
      </form>
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

// Backend refusals (account-deletion.service.ts), shown translated instead of raw.
const DELETE_ERRORS: Record<string, string> = {
  'An alert about you is in progress: your account can be deleted once it is over': 'settings.delete.ownAlert',
  'You are a Lead on an alert in progress: leave it before deleting your account': 'settings.delete.leadOnAlert',
};

function DeleteAccountPanel({
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
  const [submitting, setSubmitting] = useState(false);
  const word = t('settings.delete.word');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await deleteAccount();
      onDeleted();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      onError(DELETE_ERRORS[message] ? t(DELETE_ERRORS[message]) : message);
      setSubmitting(false);
    }
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
