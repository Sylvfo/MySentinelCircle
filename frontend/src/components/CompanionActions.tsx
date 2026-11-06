import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  acceptCircleMove,
  confirmDeath,
  declineCircleMove,
  getDeathNoticeAnnouncement,
  leaveMembership,
  moveSelfToReserve,
  rejectDeathReport,
  reportDeath,
  type Companion,
  type DeathNoticeAnnouncement,
} from '../api/sentinel';
import { Modal } from './Modal';
import { Link } from 'react-router-dom';
import { getDirectConversation, sendMessage } from '../api/messaging';

type RequestKind = 'joinFirstCircle' | 'leaveFirstCircle' | 'becomeLead' | 'stopLead';

const choice = (c: 'accept' | 'decline') =>
  c === 'accept' ? 'companions.acceptCircleMove' : 'companions.declineCircleMove';

// What I can do about someone I watch over — my place in their circles,
// the death notice, leaving — shown on their person page (PersonPage),
// under "you watch over them".
export function CompanionActions({
  companion: c,
  linkedIds,
  onChange,
  onError,
}: {
  companion: Companion;
  // People linked to me (either way): their name opens their page.
  linkedIds?: Set<string>;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingReserve, setConfirmingReserve] = useState(false);
  // Asking them for a change (join their 1st circle, become / stop being
  // their Lead Sentinel): only they can decide, so it goes to them as a
  // message in our conversation — after a confirmation saying so.
  const [asking, setAsking] = useState<RequestKind | null>(null);
  const [sent, setSent] = useState<{ kind: RequestKind; conversationUserId: string } | null>(null);
  const requestKinds: RequestKind[] = !c.circle.isPrimary
    ? ['joinFirstCircle']
    : [c.leadSlot ? 'stopLead' : 'becomeLead', 'leaveFirstCircle'];
  const sendRequest = async (kind: RequestKind) => {
    setAsking(null);
    try {
      const conv = await getDirectConversation(c.companion.id);
      await sendMessage(conv.id, t(`companions.requests.${kind}.message`, { name: c.companion.firstName }));
      setSent({ kind, conversationUserId: c.companion.id });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };
  // Accepting / declining a move into their 1st circle: confirmed first.
  const [pendingMove, setPendingMove] = useState<'accept' | 'decline' | null>(null);
  const run = (action: () => Promise<unknown>) =>
    action()
      .then(onChange)
      .catch((err) => onError(err instanceof ApiError ? err.message : String(err)));

  return (
    <div className="companion-panel">
      {/* Which circle I'm in is the pill under the figure; only a pending
          move into their 1st circle needs saying here. */}
      {c.proposedCircle && (
        <section className="member-panel-section">
          <p style={{ margin: 0 }}>{t('companions.circleMoveProposed', { who: c.companion.firstName })}</p>
          <div className="row">
            <button onClick={() => setPendingMove('accept')}>{t('companions.acceptCircleMove')}</button>
            <button className="ghost" onClick={() => setPendingMove('decline')}>
              {t('companions.declineCircleMove')}
            </button>
          </div>
        </section>
      )}

      {c.circle.isPrimary && (
        <section className="member-panel-section">
          <h4>{t('companions.sections.firstCircle', { name: c.companion.firstName })}</h4>
          {c.firstCircleMembers.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('companions.firstCircleAlone')}</p>
          ) : (
            <div>
              {c.firstCircleMembers.map((m) => (
                <span key={m.id} className="badge">
                  {linkedIds?.has(m.id) ? (
                    <Link to={`/people/${m.id}`}>{[m.firstName, m.lastName].filter(Boolean).join(' ')}</Link>
                  ) : (
                    [m.firstName, m.lastName].filter(Boolean).join(' ')
                  )}
                  {m.isLead && ` · ${t('companions.firstCircleLead')}`}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {!c.proposedCircle && (
        <section className="member-panel-section">
          {requestKinds.map((kind) => (
            <button key={kind} className="ghost" onClick={() => setAsking(kind)}>
              {t(`companions.requests.${kind}.button`, { name: c.companion.firstName })}
            </button>
          ))}
          {sent && (
            <p className="request-sent">
              ✓ {t('companions.requests.sent', { name: c.companion.firstName })}{' '}
              <Link to={`/messages/${sent.conversationUserId}`}>{t('companions.requests.openConversation')}</Link>
            </p>
          )}
        </section>
      )}
      {asking && (
        <Modal title={t(`companions.requests.${asking}.button`, { name: c.companion.firstName })} onClose={() => setAsking(null)}>
          <p>{t('companions.requests.explain', { name: c.companion.firstName })}</p>
          <blockquote className="request-preview">
            {t(`companions.requests.${asking}.message`, { name: c.companion.firstName })}
          </blockquote>
          <div className="row">
            <button onClick={() => void sendRequest(asking)}>{t('companions.requests.send')}</button>
            <button className="ghost" onClick={() => setAsking(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
      {pendingMove && (
        <Modal title={t('circles.confirm.title')} onClose={() => setPendingMove(null)}>
          <p>{t(`companions.confirmMove.${pendingMove}`, { name: c.companion.firstName })}</p>
          <div className="row">
            <button
              onClick={() => {
                const choice = pendingMove;
                setPendingMove(null);
                void run(() => (choice === 'accept' ? acceptCircleMove(c.linkId) : declineCircleMove(c.linkId)));
              }}
            >
              {t(choice(pendingMove))}
            </button>
            <button className="ghost" onClick={() => setPendingMove(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      <DeathNoticeSection companion={c} onChange={onChange} onError={onError} />

      {/* "Not available for now": into their reserve, the link stays.
          Only they can put me back in a circle. */}
      {c.circle.isReserve ? (
        <section className="member-panel-section">
          <p style={{ margin: 0 }}>{t('companions.reserve.inReserve', { name: c.companion.firstName })}</p>
        </section>
      ) : (
        !c.circle.isGroup &&
        !c.proposedCircle && (
          <section className="member-panel-section">
            {!confirmingReserve ? (
              <button className="ghost" onClick={() => setConfirmingReserve(true)}>
                {t('companions.reserve.button', { name: c.companion.firstName })}
              </button>
            ) : (
              <div className="remove-link-confirm">
                <p>{t('companions.reserve.explain', { name: c.companion.firstName })}</p>
                <div className="row">
                  <button
                    onClick={() => {
                      setConfirmingReserve(false);
                      void run(() => moveSelfToReserve(c.linkId));
                    }}
                  >
                    {t('companions.reserve.confirm')}
                  </button>
                  <button className="ghost" onClick={() => setConfirmingReserve(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </section>
        )
      )}

      {/* Ends only this direction — confirmed in place, like "remove the
          Sentinel link" on the other tile. */}
      {!c.proposedCircle && (
        <section className="member-panel-section">
          {!confirmingLeave ? (
            <button className="ghost danger" onClick={() => setConfirmingLeave(true)}>
              {t('companions.leave', { name: c.companion.firstName })}
            </button>
          ) : (
            <div className="remove-link-confirm">
              <p>{t('companions.leaveExplain', { name: c.companion.firstName })}</p>
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
            </div>
          )}
        </section>
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
