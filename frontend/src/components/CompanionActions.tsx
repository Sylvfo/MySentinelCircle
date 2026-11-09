import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../api/client';
import {
  acceptCircleMove,
  confirmDeath,
  confirmPhoneRecovery,
  declineCircleMove,
  getDeathNoticeAnnouncement,
  leaveMembership,
  moveSelfToReserve,
  rejectDeathReport,
  rejectPhoneRecovery,
  reportDeath,
  type Companion,
  type DeathNoticeAnnouncement,
} from '../api/sentinel';
import { ConfirmModal, Modal } from './Modal';
import { Link } from 'react-router-dom';
import { getDirectConversation, sendMessage } from '../api/messaging';
import { genderContext } from '../gender';
import { useAction } from '../useAction';

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
  const { run: runAction } = useAction({ onError });
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
  const sendRequest = (kind: RequestKind) => {
    setAsking(null);
    void runAction(async () => {
      const conv = await getDirectConversation(c.companion.id);
      await sendMessage(conv.id, t(`companions.requests.${kind}.message`, { name: c.companion.firstName }));
      setSent({ kind, conversationUserId: c.companion.id });
    });
  };
  // Accepting / declining a move into their 1st circle: confirmed first.
  const [pendingMove, setPendingMove] = useState<'accept' | 'decline' | null>(null);
  const run = (action: () => Promise<unknown>) =>
    runAction(async () => {
      await action();
      onChange();
    });

  return (
    <div className="companion-panel">
      {/* Which circle I'm in is the pill under the figure; only a pending
          move into their 1st circle needs saying here. */}
      {c.proposedCircle && (
        <section className="member-panel-section">
          <p style={{ margin: 0 }}>{t('companions.circleMoveProposed', { who: c.companion.firstName, context: genderContext(c.companion.gender) })}</p>
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
            <p className="muted" style={{ margin: 0 }}>{t('companions.firstCircleAlone')}</p>
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
          <p>{t('companions.requests.explain', { name: c.companion.firstName, context: genderContext(c.companion.gender) })}</p>
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

      <PhoneRecoverySection companion={c} onChange={onChange} onError={onError} />
      <DeathNoticeSection companion={c} onChange={onChange} onError={onError} />

      {/* "Not available for now": into their reserve, the link stays.
          Only they can put me back in a circle. */}
      {c.circle.isReserve ? (
        <section className="member-panel-section">
          <p style={{ margin: 0 }}>{t('companions.reserve.inReserve', { name: c.companion.firstName, context: genderContext(c.companion.gender) })}</p>
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
                <p>{t('companions.reserve.explain', { name: c.companion.firstName, context: genderContext(c.companion.gender) })}</p>
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

// Backend refusals worth saying in the viewer's language.
const RECOVERY_ERRORS: Record<string, string> = {
  'A Lead Sentinel must confirm too': 'companions.phoneRecovery.needsLead',
  'This number already has an account': 'companions.phoneRecovery.numberTaken',
};

// They lost their phone and ask to move their account to a new number:
// two people of their 1st circle (one a Lead) vouch for them, any one
// can refuse. Only their 1st circle gets `phoneRecovery`.
function PhoneRecoverySection({
  companion,
  onChange,
  onError,
}: {
  companion: Companion;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const { busy, run } = useAction({
    onError: (message) => onError(RECOVERY_ERRORS[message] ? t(RECOVERY_ERRORS[message]) : message),
  });
  const recovery = companion.phoneRecovery;
  if (!recovery) return null;
  const companionId = companion.companion.id;
  const name = companion.companion.firstName;
  const act = (action: (id: string) => Promise<unknown>) =>
    void run(async () => {
      await action(companionId);
      onChange();
    });

  return (
    <section className="member-panel-section">
      <h4>{t('companions.sections.phoneRecovery')}</h4>
      <p>{t('companions.phoneRecovery.asks', { name, phone: recovery.newPhone })}</p>
      {recovery.codeSent ? (
        <p className="muted">{t('companions.phoneRecovery.codeSent')}</p>
      ) : recovery.confirmedByMe ? (
        <p className="muted">{t('companions.phoneRecovery.waitingSecond')}</p>
      ) : (
        <>
          <p className="muted muted-small">{t('companions.phoneRecovery.checkFirst', { name })}</p>
          <span className="row-actions">
            <button disabled={busy} onClick={() => act(confirmPhoneRecovery)}>
              {t('companions.phoneRecovery.confirm')}
            </button>
            <button className="ghost" disabled={busy} onClick={() => act(rejectPhoneRecovery)}>
              {t('companions.phoneRecovery.reject')}
            </button>
          </span>
        </>
      )}
    </section>
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
  const { busy, run: runAction } = useAction({ onError });
  const [announcement, setAnnouncement] = useState<DeathNoticeAnnouncement | null>(null);
  const [askingReport, setAskingReport] = useState(false);

  const run = (action: () => Promise<unknown>) =>
    runAction(async () => {
      await action();
      onChange();
    });

  const { deathNotice } = companion;
  const companionId = companion.companion.id;

  if (deathNotice.isDeceased) {
    return (
      <span className="row-actions">
        <span className="badge">
          {t('companions.deathNotice.deceasedBadge', { context: genderContext(companion.companion.gender) })}
        </span>
        <button
          className="ghost"
          onClick={() =>
            getDeathNoticeAnnouncement(companionId)
              .then(setAnnouncement)
              .catch((err) => onError(errorText(err)))
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
      <>
        <button className="ghost" disabled={busy} onClick={() => setAskingReport(true)}>
          {t('companions.deathNotice.report')}
        </button>
        {askingReport && (
          <ConfirmModal
            message={t('companions.deathNotice.confirmReport')}
            confirmLabel={t('companions.deathNotice.report')}
            onConfirm={() => {
              setAskingReport(false);
              void run(() => reportDeath(companionId));
            }}
            onCancel={() => setAskingReport(false)}
          />
        )}
      </>
    );
  }

  return null;
}
