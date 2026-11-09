import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { devSetDeathNoticePurchased, devSetHasPaid, fetchMe, updatePause, updateProfile } from '../api/user';
import { Modal } from '../components/Modal';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../auth/AuthContext';
import { LegalLinks } from './legal/LegalPage';
import { PaidPill } from '../components/Upgrade';
import { IncludedStar } from '../components/SubscribedStar';
import { usePlan } from '../plan';
import { Loading } from '../components/Loading';
import { LockShape } from '../components/icons';
import { CollapsibleTile, TileIcon } from '../components/CollapsibleTile';
import { useLoad } from '../useLoad';
import { EditableTextField, GenderField, EditableToggle } from '../components/SettingsFields';
import {
  AvatarPanel,
  AddPhonePanel,
  ChangeEmailFlow,
  ChangePhoneFlow,
  DeleteAccountPanel,
  ChangePasswordForm,
} from '../components/AccountPanels';
import { DeathNoticePanel } from '../components/DeathNoticePanel';
import { LoginHistory } from '../components/LoginHistory';

export function SettingsPage() {
  const { t } = useTranslation();
  const { logout, refreshUser } = useAuth();
  const { plan, reload: reloadPlan } = usePlan();
  const { data: me, loading, error, setError, reload } = useLoad(fetchMe);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [open, setOpen] = useState<TileKey | null>(null);

  if (loading) return <Loading />;
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
            <LoginHistory />
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
  account: <LockShape />,
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
    <CollapsibleTile
      id={`settings-${tileKey}`}
      open={open}
      onToggle={onToggle}
      className={['settings-tile', className].filter(Boolean).join(' ')}
      bodyClassName="settings-tile-body"
      icon={<TileIcon>{TILE_ICONS[tileKey]}</TileIcon>}
      title={
        <>
          {t(`settings.tiles.${tileKey}.title`)}
          {badge}
          <small>{t(`settings.tiles.${tileKey}.hint`)}</small>
        </>
      }
    >
      {children}
    </CollapsibleTile>
  );
}
