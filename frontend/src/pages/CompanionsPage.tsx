import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
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
  type Companion,
  type DeathNoticeAnnouncement,
  type Invitation,
} from '../api/sentinel';
import { Modal } from '../components/Modal';
import { Tile } from '../components/Tile';
import { CompanionIcon } from '../components/CompanionIcon';
import { PRIMARY_AVATAR_COLOR, companionColor } from '../theme';

export function CompanionsPage() {
  const { t } = useTranslation();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { linkId } = useParams();

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

  // Anything waiting on me goes first: a pending circle-move proposal or a
  // death report to confirm. Invitations received sit above the list anyway.
  const needsAnswer = (c: Companion) => !!c.proposedCircle || !!c.deathNotice.pending?.canConfirmOrReject;
  const sorted = [...companions].sort((a, b) => Number(needsAnswer(b)) - Number(needsAnswer(a)));

  // /companions/:linkId: one companion's details and actions, like a
  // circle's own page on My Circles.
  if (linkId) {
    const c = companions.find((x) => x.linkId === linkId);
    // Unknown id, or I just left this companion from their own page.
    if (!c) return <Navigate to="/companions" replace />;
    return (
      <div className="page-bleed companion-page">
        <Link to="/companions">{t('companions.backToList')}</Link>
        {error && <p className="form-error">{error}</p>}
        <div className="companion-detail-head">
          <CompanionIcon
            size={96}
            color={companionColor(c.companion.id)}
            shieldColor={c.leadSlot ? PRIMARY_AVATAR_COLOR : undefined}
          />
          <h1>
            {c.companion.firstName} {c.companion.lastName}
          </h1>
          {c.companion.userName && <span className="companion-username">@{c.companion.userName}</span>}
          {c.companion.phone && <span className="companion-contact">{c.companion.phone}</span>}
          {c.companion.email && <span className="companion-contact">{c.companion.email}</span>}
          {c.leadSlot && <p className="companion-lead-note">{t('companions.youAreLead')}</p>}
          <Link to={`/messages/${c.companion.id}`} className="button-link">
            {t('companions.sendMessage', { name: c.companion.firstName })}
          </Link>
        </div>
        <CompanionPanel companion={c} onChange={reload} onError={setError} />
      </div>
    );
  }

  return (
    <div className="page-bleed sticky-header-page companion-page">
      <div className="sticky-header">
        <h1>{t('companions.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('companions.intro')}</p>
        {error && <p className="form-error">{error}</p>}
        <div className="header-actions">
          <Link to="/companions/new" className="button-link">
            {t('companions.new')}
          </Link>
        </div>
      </div>

      <InvitationsInbox invitations={invitations} onChange={reload} />

      {companions.length === 0 ? (
        <div className="empty-state">{t('companions.empty')}</div>
      ) : (
        <div className="companion-grid">
          {sorted.map((c) => (
            <Link key={c.linkId} to={`/companions/${c.linkId}`} className="companion-card">
              {/* Their own blue-violet shade; the shield turns gold when I'm their Lead. */}
              <CompanionIcon
                size={72}
                color={companionColor(c.companion.id)}
                shieldColor={c.leadSlot ? PRIMARY_AVATAR_COLOR : undefined}
              />
              <span className="companion-name">{c.companion.firstName}</span>
              {needsAnswer(c) && <span className="companion-needs-answer">{t('companions.needsAnswer')}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// What can be done about one companion, grouped like a Sentinel's panel on
// My Circles: my place in their circles, then the death notice, then leaving.
function CompanionPanel({
  companion: c,
  onChange,
  onError,
}: {
  companion: Companion;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const run = (action: () => Promise<unknown>) =>
    action()
      .then(onChange)
      .catch((err) => onError(err instanceof ApiError ? err.message : String(err)));

  return (
    <Tile className="companion-panel">
      <section className="member-panel-section">
        <h4>{t('companions.sections.myPlace')}</h4>
        <div>
          <span className="badge">{t('companions.inCircle', { label: c.circle.label })}</span>
          <span className="badge">{t(`sentinel.type.${c.sentinelType}`)}</span>
        </div>
        {c.proposedCircle && (
          <>
            <p style={{ margin: 0 }}>{t('companions.circleMoveProposed', { who: c.companion.firstName })}</p>
            <div className="row">
              <button onClick={() => run(() => acceptCircleMove(c.linkId))}>{t('companions.acceptCircleMove')}</button>
              <button className="ghost" onClick={() => run(() => declineCircleMove(c.linkId))}>
                {t('companions.declineCircleMove')}
              </button>
            </div>
          </>
        )}
      </section>

      {c.circle.isPrimary && (
        <section className="member-panel-section">
          <h4>{t('companions.sections.firstCircle', { name: c.companion.firstName })}</h4>
          {c.firstCircleMembers.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('companions.firstCircleAlone')}</p>
          ) : (
            <div>
              {c.firstCircleMembers.map((m) => (
                <span key={m.id} className="badge">
                  {[m.firstName, m.lastName].filter(Boolean).join(' ')}
                  {m.isLead && ` · ${t('companions.firstCircleLead')}`}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <DeathNoticeSection companion={c} onChange={onChange} onError={onError} />

      {!c.proposedCircle && (
        <section className="member-panel-section">
          <button className="ghost danger" onClick={() => setConfirmingLeave(true)}>
            {t('companions.leave', { name: c.companion.firstName })}
          </button>
        </section>
      )}
      {confirmingLeave && (
        <Modal title={t('companions.leaveTitle')} onClose={() => setConfirmingLeave(false)}>
          <p>{t('companions.confirmLeave', { name: c.companion.firstName })}</p>
          <div className="row">
            <button
              className="danger"
              onClick={() => {
                setConfirmingLeave(false);
                void run(() => leaveMembership(c.linkId));
              }}
            >
              {t('companions.leaveConfirmButton')}
            </button>
            <button className="ghost" onClick={() => setConfirmingLeave(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </Tile>
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
// Only rendered (as its own panel section) when there's something to show.
function DeathNoticeSection(props: { companion: Companion; onChange: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const { deathNotice } = props.companion;
  if (!deathNotice.isDeceased && !deathNotice.pending && !deathNotice.canReport) return null;
  return (
    <section className="member-panel-section">
      <h4>{t('companions.sections.deathNotice')}</h4>
      <DeathNoticeControls {...props} />
    </section>
  );
}

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
