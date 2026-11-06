import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  changePassword,
  deleteAccount,
  devSetDeathNoticePurchased,
  devSetHasPaid,
  fetchMe,
  getMyDeathNotice,
  requestAddPhone,
  requestEmailChange,
  setDeathNoticeRecipients,
  updateMyDeathNotice,
  removeAvatar,
  updatePause,
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
import { LegalLinks } from './legal/LegalPage';
import { PaidPill, UpgradeNotice } from '../components/Upgrade';
import { IncludedStar } from '../components/SubscribedStar';
import { usePlan } from '../plan';
import { useAvatarUrl } from '../avatars';
import { GenderSelect } from '../components/GenderSelect';
import type { Gender } from '../gender';

export function SettingsPage() {
  const { t } = useTranslation();
  const { logout, refreshUser } = useAuth();
  const { plan, reload: reloadPlan } = usePlan();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [open, setOpen] = useState<TileKey | null>(null);

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

  const toggle = (key: TileKey) => setOpen((cur) => (cur === key ? null : key));
  const tile = (key: TileKey, children: ReactNode, extraClass = '', badge?: ReactNode) => (
    <SettingsTile
      key={key}
      tileKey={key}
      open={open === key}
      onToggle={() => toggle(key)}
      className={extraClass}
      badge={badge}
    >
      {children}
    </SettingsTile>
  );

  return (
    <div className="settings-page">
      <h1>{t('settings.title')}</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="about-tiles">
        {tile(
          'profile',
          <>
            <AvatarPanel me={me} onChange={reload} onError={setError} />
            <EditableTextField
              label={t('auth.firstName')}
              value={me.firstName}
              onSave={(v) => updateProfile({ firstName: v })}
              onSaved={reload}
              onError={setError}
              required
            />
            <EditableTextField
              label={t('auth.lastName')}
              value={me.lastName ?? ''}
              onSave={(v) => updateProfile({ lastName: v })}
              onSaved={reload}
              onError={setError}
            />
            <GenderField
              value={me.gender}
              onSave={(v) => updateProfile({ gender: v })}
              onSaved={() => {
                void reload();
                void refreshUser();
              }}
              onError={setError}
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
                onSaved={reload}
                onError={setError}
                hint={t('auth.usernameHint')}
                minLength={3}
                maxLength={30}
                required
              />
            )}
            <EditableTextField
              label={t('settings.publicStatus')}
              value={me.publicStatus ?? ''}
              onSave={(v) => updateProfile({ publicStatus: v })}
              onSaved={reload}
              onError={setError}
            />
            <p className="form-hint settings-field-hint">{t('settings.publicStatusHint')}</p>
          </>,
        )}

        {tile(
          'account',
          <>
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
            {(me.hasPassword || me.email) && (
              <div className="row wrap">
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
            )}
            <EditableToggle
              label={t('settings.isMajor')}
              value={me.isMajor}
              onSave={(v) => updateProfile({ isMajor: v })}
              onSaved={reload}
              onError={setError}
            />
            <div>
              <label>{t('settings.status')}</label>
              <p>{me.status}</p>
            </div>
            <div>
              <label>{t('settings.createdAt')}</label>
              <p>{new Date(me.createdAt).toLocaleString()}</p>
            </div>
          </>,
        )}

        {tile(
          'subscription',
          <>
            <div>
              <label>{t('settings.userType')}</label>
              <p>{t(`settings.subscription.userTypes.${me.userType}`, { defaultValue: me.userType })}</p>
            </div>
            <div>
              <label>{t('settings.subscription.plan')}</label>
              <p>
                <strong>{t(me.hasPaid ? 'settings.subscription.paid' : 'settings.subscription.free')}</strong>
              </p>
            </div>
            {plan && plan.freeAlertsLeft !== null && (
              <p className="form-hint settings-field-hint">
                {t('plans.alertsLeft', { count: plan.freeAlertsLeft, limit: plan.freeAlertLimit })}
              </p>
            )}
            {plan?.deathNoticePurchased && !plan.hasPaid && (
              <p className="form-hint settings-field-hint">{t('plans.deathNotice.owned')}</p>
            )}
            <p className="form-hint settings-field-hint">{t('settings.subscription.whatPaid')}</p>
            <Link to="/plans" className="button-link">
              {t('plans.seePlans')}
            </Link>
            {import.meta.env.DEV && (
              <div className="settings-dev">
                <h3>{t('settings.dev.title')}</h3>
                <p className="form-hint">{t('settings.dev.hasPaidHint')}</p>
                <EditableToggle
                  label={t('settings.dev.hasPaid')}
                  value={me.hasPaid}
                  onSave={(v) => devSetHasPaid(v)}
                  onSaved={() => {
                    void reload();
                    reloadPlan();
                  }}
                  onError={setError}
                />
                <EditableToggle
                  label={t('settings.dev.deathNoticePurchased')}
                  value={plan?.deathNoticePurchased ?? false}
                  onSave={(v) => devSetDeathNoticePurchased(v)}
                  onSaved={reloadPlan}
                  onError={setError}
                />
              </div>
            )}
          </>,
        )}

        {tile(
          'preferences',
          <>
            <div>
              <label>{t('common.language')}</label>
              <LanguageSwitcher />
            </div>
            {/* General switch, wins over each circle's own rule (circle page). */}
            <EditableToggle
              label={t('settings.alertChatWithFirstCircle')}
              value={me.alertChatWithFirstCircle}
              onSave={(v) => updateProfile({ alertChatWithFirstCircle: v })}
              onSaved={() => {
                void reload();
                void refreshUser();
              }}
              onError={setError}
            />
            <p className="form-hint">{t('settings.alertChatWithFirstCircleHint')}</p>
            {/* Two independent pauses (plan.txt, PAUSE). */}
            <EditableToggle
              label={t('pause.settings.forMe')}
              value={me.pausedForMe}
              onSave={(v) => updatePause({ pausedForMe: v })}
              onSaved={() => {
                void reload();
                void refreshUser();
              }}
              onError={setError}
            />
            <p className="form-hint">{t('pause.settings.forMeHint')}</p>
            <EditableToggle
              label={t('pause.settings.forOthers')}
              value={me.pausedForOthers}
              onSave={(v) => updatePause({ pausedForOthers: v })}
              onSaved={() => {
                void reload();
                void refreshUser();
              }}
              onError={(m) => setError(m.startsWith('You are a Lead') ? t('pause.settings.leadBlocked') : m)}
            />
            <p className="form-hint">{t('pause.settings.forOthersHint')}</p>
          </>,
        )}
      </div>

      {/* Set apart: a different matter from everyday settings. */}
      <div className="about-tiles settings-apart">
        {tile(
          'deathNotice',
          <DeathNoticePanel onError={setError} />,
          'settings-quiet',
          // Free: the lock pill. Subscribed: the gold star (it's included).
          plan && !plan.deathNotice ? (
            <PaidPill feature="deathNotice" chip />
          ) : plan?.hasPaid ? (
            <IncludedStar />
          ) : undefined,
        )}
        {tile('delete', <DeleteAccountPanel me={me} onDeleted={logout} onError={setError} />, 'settings-danger')}
      </div>

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

      <div className="settings-logout">
        <button type="button" className="ghost" onClick={logout}>
          {t('nav.logout')}
        </button>
      </div>
      <LegalLinks />
    </div>
  );
}

// Settings, grouped like the Info page: tiles that unfold one at a time.
type TileKey = 'profile' | 'account' | 'subscription' | 'preferences' | 'deathNotice' | 'delete';

const TILE_ICONS: Record<TileKey, ReactNode> = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 C4 16.5 7.5 14 12 14 C16.5 14 20 16.5 20 21" />
    </>
  ),
  account: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" />
    </>
  ),
  subscription: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <line x1="2.5" y1="10" x2="21.5" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
    </>
  ),
  preferences: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.2" />
      <circle cx="15" cy="17" r="2.2" />
    </>
  ),
  deathNotice: <path d="M12 21 C7 17 3.5 13.5 3.5 9.5 A4.5 4.5 0 0 1 12 7 A4.5 4.5 0 0 1 20.5 9.5 C20.5 13.5 17 17 12 21 Z" />,
  delete: (
    <>
      <path d="M4 7 H20" />
      <path d="M9 7 V4.5 H15 V7" />
      <path d="M6 7 L7 20 H17 L18 7" />
    </>
  ),
};

function SettingsTile({
  tileKey,
  open,
  onToggle,
  className,
  badge,
  children,
}: {
  tileKey: TileKey;
  open: boolean;
  onToggle: () => void;
  className?: string;
  // Shown after the title, e.g. the lock on a paid feature.
  badge?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={`about-tile settings-tile ${className ?? ''}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="about-tile-head"
        aria-expanded={open}
        aria-controls={`settings-${tileKey}`}
        onClick={onToggle}
      >
        <svg
          className="about-tile-icon"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {TILE_ICONS[tileKey]}
        </svg>
        <span className="about-tile-title">
          {t(`settings.tiles.${tileKey}.title`)}
          {badge}
          <small>{t(`settings.tiles.${tileKey}.hint`)}</small>
        </span>
        <svg className="about-tile-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div className="about-tile-body settings-tile-body" id={`settings-${tileKey}`}>
          {children}
        </div>
      )}
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

// How texts speak about me ("can you go and see her?"). Only I set it.
function GenderField({
  value: initialValue,
  onSave,
  onSaved,
  onError,
}: {
  value: Gender | null;
  onSave: (value: Gender | null) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(initialValue ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(value === '' ? null : (value as Gender));
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label>
        {t('gender.label')}
        <div className="row">
          <GenderSelect value={value} onChange={setValue} />
          <button type="submit" disabled={submitting || value === (initialValue ?? '')}>
            {t('common.save')}
          </button>
        </div>
      </label>
      <p className="form-hint">{t('gender.hint')}</p>
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

// Prepared while alive: the announcement broadcast to opted-in Sentinels
// once a death is confirmed (see SentinelService.confirmDeath), and who
// among them is notified, each with an optional personal message.
function DeathNoticePanel({ onError }: { onError: (m: string) => void }) {
  const { t } = useTranslation();
  const { plan } = usePlan();
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

  // Preparing it is paid: subscription or one-time purchase.
  if (plan && !plan.deathNotice) {
    return (
      <section className="panel">
        <h2>{t('settings.deathNotice.title')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t('settings.deathNotice.intro')}</p>
        <UpgradeNotice reason="deathNotice" />
      </section>
    );
  }

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
