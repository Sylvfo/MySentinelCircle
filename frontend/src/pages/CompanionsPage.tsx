import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  acceptCircleMove,
  acceptMembership,
  confirmDeath,
  declineCircleMove,
  declineMembership,
  getDeathNoticeAnnouncement,
  leaveMembership,
  listCompanions,
  listMyInvitations,
  rejectDeathReport,
  reportDeath,
  requestToBeSentinel,
  type Companion,
  type DeathNoticeAnnouncement,
  type Invitation,
} from '../api/sentinel';
import { Modal } from '../components/Modal';
import { Tile } from '../components/Tile';

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
    void reload().finally(() => setLoading(false));
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
        <div className="tile-grid">
          {companions.map((c) => (
            <Tile
              key={c.linkId}
              title={c.companion.email || c.companion.phone}
              actions={
                !c.proposedCircle && (
                  <button
                    className="ghost"
                    onClick={() => {
                      if (window.confirm(t('companions.confirmLeave'))) void leaveMembership(c.linkId).then(reload);
                    }}
                  >
                    {t('companions.leave')}
                  </button>
                )
              }
            >
              <div className="row">
                <span>
                  <span className="badge">{t('companions.inCircle', { label: c.circle.label })}</span>
                  <span className="badge">{t(`sentinel.type.${c.sentinelType}`)}</span>
                </span>
              </div>
              {c.proposedCircle && (
                <div className="row">
                  <span>
                    {t('companions.circleMoveProposed', {
                      who: c.companion.email || c.companion.phone,
                    })}
                  </span>
                  <span className="row-actions">
                    <button onClick={() => acceptCircleMove(c.linkId).then(reload)}>
                      {t('companions.acceptCircleMove')}
                    </button>
                    <button className="ghost" onClick={() => declineCircleMove(c.linkId).then(reload)}>
                      {t('companions.declineCircleMove')}
                    </button>
                  </span>
                </div>
              )}
              <DeathNoticeControls companion={c} onChange={reload} onError={setError} />
            </Tile>
          ))}
        </div>
      )}
    </div>
  );
}

function InvitationsInbox({ invitations, onChange }: { invitations: Invitation[]; onChange: () => void }) {
  const { t } = useTranslation();
  if (invitations.length === 0) return null;

  return (
    <Tile title={t('companions.invitations')}>
      {invitations.map((inv) => (
        <div key={inv.id} className="row">
          <span>
            {t('companions.invitedBy', { who: inv.circle.userCompanion.email || inv.circle.userCompanion.phone })} — {inv.circle.label}
          </span>
          <span className="row-actions">
            <button onClick={() => acceptMembership(inv.id).then(onChange)}>{t('companions.accept')}</button>
            <button className="ghost" onClick={() => declineMembership(inv.id).then(onChange)}>
              {t('companions.decline')}
            </button>
          </span>
        </div>
      ))}
    </Tile>
  );
}

// Report/confirm/reject a death, and view the announcement once deceased.
// Eligibility (who sees which button) is decided server-side and carried
// on the companion row (listCompanions) — this component just renders it.
function DeathNoticeControls({
  companion,
  onChange,
  onError,
}: {
  companion: Companion;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState<DeathNoticeAnnouncement | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const { deathNotice } = companion;
  const companionId = companion.companion.id;

  if (deathNotice.isDeceased) {
    return (
      <span className="row-actions">
        <span className="badge">{t('companions.deathNotice.deceasedBadge')}</span>
        <button
          className="ghost"
          onClick={() =>
            getDeathNoticeAnnouncement(companionId)
              .then(setAnnouncement)
              .catch((err) => onError(err instanceof ApiError ? err.message : String(err)))
          }
        >
          {t('companions.deathNotice.viewAnnouncement')}
        </button>
        {announcement && (
          <Modal title={t('companions.deathNotice.announcementTitle')} onClose={() => setAnnouncement(null)}>
            <p>{announcement.announcementMessage}</p>
            {announcement.personalMessage && (
              <p>
                <strong>{t('companions.deathNotice.personalMessageLabel')}</strong> {announcement.personalMessage}
              </p>
            )}
          </Modal>
        )}
      </span>
    );
  }

  if (deathNotice.pending) {
    return (
      <span className="row-actions">
        <span>
          {t('companions.deathNotice.pendingReport', { who: deathNotice.pending.reportedByLabel })}
        </span>
        {deathNotice.pending.canConfirmOrReject && (
          <>
            <button disabled={busy} onClick={() => run(() => confirmDeath(companionId))}>
              {t('companions.deathNotice.confirm')}
            </button>
            <button className="ghost" disabled={busy} onClick={() => run(() => rejectDeathReport(companionId))}>
              {t('companions.deathNotice.reject')}
            </button>
          </>
        )}
      </span>
    );
  }

  if (deathNotice.canReport) {
    return (
      <button
        className="ghost"
        disabled={busy}
        onClick={() => {
          if (window.confirm(t('companions.deathNotice.confirmReport'))) void run(() => reportDeath(companionId));
        }}
      >
        {t('companions.deathNotice.report')}
      </button>
    );
  }

  return null;
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
