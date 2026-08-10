import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  acceptMembership,
  declineMembership,
  leaveMembership,
  listCompanions,
  listMyInvitations,
  requestToBeSentinel,
  type Companion,
  type Invitation,
} from '../api/sentinel';

export function CompanionsPage() {
  const { t } = useTranslation();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    try {
      const [c, i] = await Promise.all([listCompanions(), listMyInvitations()]);
      setCompanions(c);
      setInvitations(i);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  return (
    <div>
      <h1>{t('companions.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('companions.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      <InvitationsInbox invitations={invitations} onChange={reload} />
      <RequestForm onError={setError} />

      {companions.length === 0 ? (
        <div className="empty-state">{t('companions.empty')}</div>
      ) : (
        <section className="panel">
          {companions.map((c) => (
            <div key={c.membershipId} className="row member-row">
              <span>
                {c.companion.email || c.companion.phone}
                <span className="badge">{t('companions.inCircle', { label: c.circle.label })}</span>
                <span className="badge">{t(`sentinel.type.${c.sentinelType}`)}</span>
              </span>
              <button
                className="ghost"
                onClick={() => {
                  if (window.confirm(t('companions.confirmLeave'))) leaveMembership(c.membershipId).then(reload);
                }}
              >
                {t('companions.leave')}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function InvitationsInbox({ invitations, onChange }: { invitations: Invitation[]; onChange: () => void }) {
  const { t } = useTranslation();
  if (invitations.length === 0) return null;

  return (
    <section className="panel">
      <h2>{t('companions.invitations')}</h2>
      {invitations.map((inv) => (
        <div key={inv.id} className="row">
          <span>
            {t('companions.invitedBy', { who: inv.circle.owner.email || inv.circle.owner.phone })} — {inv.circle.label}
          </span>
          <span className="row-actions">
            <button onClick={() => acceptMembership(inv.id).then(onChange)}>{t('companions.accept')}</button>
            <button className="ghost" onClick={() => declineMembership(inv.id).then(onChange)}>
              {t('companions.decline')}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function RequestForm({ onError }: { onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setInfo(null);
    try {
      await requestToBeSentinel(phone.trim());
      setPhone('');
      setInfo(t('companions.requestSent'));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <h2>{t('companions.requestTitle')}</h2>
      <p style={{ color: 'var(--text-muted)' }}>{t('companions.requestIntro')}</p>
      <div className="row">
        <input type="tel" required placeholder={t('companions.targetPhone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit" disabled={submitting || !phone.trim()}>
          {t('companions.sendRequest')}
        </button>
      </div>
      {info && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{info}</p>}
    </form>
  );
}
