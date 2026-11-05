import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  acceptCircleMove,
  confirmDeath,
  declineCircleMove,
  getDeathNoticeAnnouncement,
  leaveMembership,
  rejectDeathReport,
  reportDeath,
  type Companion,
  type DeathNoticeAnnouncement,
} from '../api/sentinel';
import { Modal } from './Modal';

// What I can do about someone I watch over — my place in their circles,
// the death notice, leaving — shown on their person page (PersonPage),
// under "you watch over them".
export function CompanionActions({
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
    <div className="companion-panel">
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
    </div>
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
