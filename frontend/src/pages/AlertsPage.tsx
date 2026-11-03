import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError, API_URL } from '../api/client';
import {
  claimLead,
  closeAlert,
  getAlert,
  getMyParticipation,
  leaveAlert,
  listAlerts,
  raiseAlert,
  requestCircle,
  requestCircleChat,
  respondToAlert,
  updateAlertLabel,
  updateAlertStatus,
  type AlertDetail,
  type AlertParticipant,
  type AlertSummary,
  type AlertType,
  type MyAlertSummary,
  type MyParticipation,
} from '../api/alert';
import { listCompanions, type Companion } from '../api/sentinel';
import { listMessages, sendImageMessage, sendMessage, type Message } from '../api/messaging';
import { Modal } from '../components/Modal';
import { Tile } from '../components/Tile';

// The 4 ways to raise an alert, one tile each. "For myself" is always
// BYCOMPANION; the two "for someone I watch over" tiles map to one type each;
// travel mode isn't built yet. LITTLEWORRY/EMERGENCY/NOCONTACT/UNKNOWN still
// exist in the schema but aren't offered from here.
type RaiseKind = 'self' | 'missing' | 'assistance';
const RAISE_TYPE: Record<RaiseKind, AlertType> = { self: 'BYCOMPANION', missing: 'MISSING', assistance: 'INCIDENT' };

export function AlertsPage() {
  const { t } = useTranslation();
  const { kind } = useParams();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const myActiveAlert = alerts.find((a) => a.userCompanionId === user?.id && a.alertStatus !== 'RESOLVED');

  // /alerts/:kind — one tile's own page.
  if (kind === 'self' || kind === 'missing' || kind === 'assistance') {
    return <RaiseAlertPage kind={kind} activeAlert={myActiveAlert} />;
  }
  if (kind) return <Navigate to="/alerts" replace />;

  // This page is for launching a new alert only — any alert already in
  // progress lives on its own /running-alert page instead (reached from the
  // Dashboard's "Running Alert" card, which only shows up while one exists).
  return (
    <div>
      <h1>{t('alerts.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('alerts.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      <div className="tile-grid raise-grid">
        <Link to="/alerts/self" className="tile-link">
          <Tile className="tile-raise" title={t('alerts.tiles.self.title')}>
            <p>{myActiveAlert ? t('alerts.activeAlertNotice') : t('alerts.tiles.self.hint')}</p>
          </Tile>
        </Link>
        <Link to="/alerts/missing" className="tile-link">
          <Tile title={t('alerts.tiles.missing.title')}>
            <p style={{ color: 'var(--text-muted)' }}>{t('alerts.tiles.missing.hint')}</p>
          </Tile>
        </Link>
        <Link to="/alerts/assistance" className="tile-link">
          <Tile title={t('alerts.tiles.assistance.title')}>
            <p style={{ color: 'var(--text-muted)' }}>{t('alerts.tiles.assistance.hint')}</p>
          </Tile>
        </Link>
        {/* Not built yet — shown so people know it's coming, not clickable. */}
        <Tile className="tile-soon" title={t('alerts.tiles.travel.title')}>
          <p style={{ color: 'var(--text-muted)' }}>{t('alerts.tiles.travel.hint')}</p>
          <span className="badge">{t('alerts.tiles.soon')}</span>
        </Tile>
      </div>
    </div>
  );
}

// One form for all 3 tiles. Everything is optional: in a real emergency the
// big button alone must be enough. The DB has two fields for this —
// messageAlert (what's happening + what's needed, set once at launch) and
// a status note: statusByCompanion when raising for myself,
// statusByFirstCircle when a 1st-circle Sentinel raises for their companion
// (outside the 1st circle you can raise but not write a status, so the
// field is hidden).
function RaiseAlertPage({ kind, activeAlert }: { kind: RaiseKind; activeAlert: AlertSummary | undefined }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const forSelf = kind === 'self';
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loadingCompanions, setLoadingCompanions] = useState(!forSelf);
  const [companionId, setCompanionId] = useState('');
  const [situation, setSituation] = useState('');
  const [needs, setNeeds] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forSelf) return;
    // Any Sentinel (any circle) is authorized to raise — it always notifies
    // the companion's 1st circle regardless of which circle the raiser is in.
    listCompanions()
      .then((all) => {
        setCompanions(all);
        if (all.length > 0) setCompanionId(all[0].companion.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoadingCompanions(false));
  }, [forSelf]);

  const canWriteStatus = forSelf || !!companions.find((c) => c.companion.id === companionId)?.circle.isPrimary;

  const raise = async () => {
    const targetId = forSelf ? user?.id : companionId;
    if (!targetId) return;
    setSubmitting(true);
    setError(null);
    const reason = [situation.trim(), needs.trim() && `${t('alerts.self.needsPrefix')} ${needs.trim()}`]
      .filter(Boolean)
      .join('\n\n');
    try {
      const alert = await raiseAlert({
        companionId: targetId,
        alertType: RAISE_TYPE[kind],
        reason: reason || t('alerts.defaultReason'),
      });
      if (canWriteStatus && status.trim()) await updateAlertStatus(alert.id, status.trim());
      navigate('/running-alert');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const header = (
    <>
      <Link to="/alerts">{t('alerts.backToTiles')}</Link>
      <h1>{t(`alerts.tiles.${kind}.title`)}</h1>
    </>
  );

  if (forSelf && activeAlert) {
    return (
      <div>
        {header}
        <Tile className="alert-active">
          <p>{t('alerts.activeAlertNotice')}</p>
          <Link to="/running-alert" className="button-link">
            {t('alerts.seeRunningAlert')}
          </Link>
        </Tile>
      </div>
    );
  }

  if (loadingCompanions) return header;
  if (!forSelf && companions.length === 0) {
    return (
      <div>
        {header}
        <div className="empty-state">{t('alerts.noCompanions')}</div>
      </div>
    );
  }

  const f = forSelf ? 'self' : 'other';
  return (
    <div>
      {header}
      <Tile className="raise-self-form">
        <p style={{ color: 'var(--text-muted)' }}>{t('alerts.self.intro')}</p>
        {!forSelf && (
          <label>
            {t('alerts.whoLabel')}
            <select value={companionId} onChange={(e) => setCompanionId(e.target.value)}>
              {companions.map((c) => (
                <option key={c.linkId} value={c.companion.id}>
                  {[c.companion.firstName, c.companion.lastName].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t(`alerts.${f}.situationLabel`)}
          <textarea
            rows={3}
            placeholder={t(`alerts.${f}.situationPlaceholder`)}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
          />
        </label>
        <label>
          {t(`alerts.${f}.needsLabel`)}
          <textarea
            rows={2}
            placeholder={t(`alerts.${f}.needsPlaceholder`)}
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
          />
        </label>
        {canWriteStatus && (
          <label>
            {t('alerts.self.statusLabel')}
            <input
              placeholder={t(`alerts.${f}.statusPlaceholder`)}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
          </label>
        )}
        <button className="alert-btn" disabled={submitting || (forSelf ? !user : !companionId)} onClick={raise}>
          {forSelf ? t('alerts.raiseForSelf') : t('alerts.submit')}
        </button>
        {error && <p className="form-error">{error}</p>}
      </Tile>
    </div>
  );
}

// "Stop the alert", behind a confirmation — only the companion and their
// 1st circle can stop one (enforced by the backend too), so it renders
// nothing for anyone else.
export function StopAlertButton({ alert, onStopped }: { alert: MyAlertSummary; onStopped: () => Promise<void> }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [finalWord, setFinalWord] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canStop =
    alert.alertStatus !== 'RESOLVED' &&
    (alert.userCompanionId === user?.id || alert.myParticipation?.circleId === alert.firstCircleId);
  if (!canStop) return null;

  const stop = async () => {
    setConfirming(false);
    try {
      // The final word becomes the stopper's own status note (companion or
      // 1st circle side), written just before the alert closes.
      if (finalWord.trim()) await updateAlertStatus(alert.id, finalWord.trim());
      await closeAlert(alert.id);
      await onStopped();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <div className="alert-stop">
      <button className="ghost danger" onClick={() => setConfirming(true)}>
        {t('alerts.stop')}
      </button>
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <Modal title={t('alerts.stopTitle')} onClose={() => setConfirming(false)}>
          <p>{t('alerts.stopConfirm')}</p>
          <label className="stop-final-word">
            {t('alerts.stopFinalWordLabel')}
            <textarea
              rows={2}
              placeholder={t('alerts.stopFinalWordPlaceholder')}
              value={finalWord}
              onChange={(e) => setFinalWord(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="danger" onClick={stop}>
              {t('alerts.stopConfirmButton')}
            </button>
            <button className="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Laid out by what the viewer does with it: "To do" (only what's theirs to
// act on right now — first, for someone under stress), "To know"
// (read-only), the discussion, then the ways out at the very bottom
// (leave, then `footer` — the Running Alert page's "Stop the alert").
export function AlertDetailPanel({ alertId, footer }: { alertId: string; footer?: ReactNode }) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  // Set only when getAlert() 403s (e.g. an outer-circle Sentinel) but the
  // caller does have their own participation to show, as a lighter fallback.
  const [myParticipation, setMyParticipation] = useState<MyParticipation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    try {
      const d = await getAlert(alertId);
      setDetail(d);
      setMyParticipation(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        try {
          setDetail(null);
          setMyParticipation(await getMyParticipation(alertId));
          return;
        } catch (fallbackErr) {
          setError(fallbackErr instanceof ApiError ? fallbackErr.message : String(fallbackErr));
          return;
        }
      }
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void loadDetail().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  useEffect(() => {
    if (!socket) return;
    const onAlertChanged = (payload: { alertId: string }) => {
      if (payload.alertId === alertId) void loadDetail();
    };
    socket.on('alert:changed', onAlertChanged);
    return () => {
      socket.off('alert:changed', onAlertChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, alertId]);

  // The companion reads every conversation's transcript straight off
  // `detail.conversations[].messages` (they're never a ConversationParticipant,
  // so listMessages() would 403 them) — a new message in one of this
  // alert's own conversations means re-fetching the whole alert to pick it
  // up. A Sentinel's own ConversationThread below handles its own
  // conversation's live updates independently, so this is a companion-only
  // concern in practice. Filtered against a ref (not `detail` in the
  // dependency array) so the listener isn't torn down and resubscribed on
  // every reload, and so a message:new for some unrelated conversation
  // elsewhere doesn't cause a wasted GET here — the global rate limit is
  // shared across the whole app, so this adds up fast under heavy use.
  const detailRef = useRef<AlertDetail | null>(null);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (detailRef.current?.conversations.some((c) => c.id === payload.conversationId)) {
        void loadDetail();
      }
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, alertId]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  if (!detail) {
    if (myParticipation) {
      const canRespondLight =
        myParticipation.status === 'CONTACTED' && myParticipation.alert.alertStatus !== 'RESOLVED';
      const canChat =
        !!myParticipation.firstCircleMessagingModeAtAlert &&
        myParticipation.firstCircleMessagingModeAtAlert !== 'NONE' &&
        myParticipation.alert.alertStatus !== 'RESOLVED';
      const canLeaveLight = myParticipation.status !== 'CLOSED' && myParticipation.alert.alertStatus !== 'RESOLVED';
      return (
        <div className="alert-detail">
          <p className="alert-role">
            {myParticipation.status === 'CONTACTED'
              ? t('alerts.detail.role.asked')
              : myParticipation.status === 'CLOSED'
                ? t('alerts.detail.role.left')
                : t('alerts.detail.role.involved')}
          </p>
          {canRespondLight && (
            <AlertSection title={t('alerts.detail.sections.todo')}>
              <RespondButtons alertId={alertId} onChange={loadDetail} />
            </AlertSection>
          )}
          {/* Outside the 1st circle: no alert details (no launch message, no
              roster) — only the statuses and my own answer. */}
          <AlertSection title={t('alerts.detail.sections.know')}>
            <StatusNoteField label={t('alerts.detail.statusByCompanion')} value={myParticipation.alert.statusByCompanion} />
            <StatusNoteField label={t('alerts.detail.statusByFirstCircle')} value={myParticipation.alert.statusByFirstCircle} />
            <p>
              <strong>{t('alerts.detail.myResponse')}</strong>{' '}
              {myParticipation.response ?? t('alerts.detail.noResponseYet')}
            </p>
          </AlertSection>
          {canChat && (
            <AlertSection title={t('alerts.detail.sections.discussion')}>
              <CircleChatSection alertId={alertId} />
            </AlertSection>
          )}
          {error && <p className="form-error">{error}</p>}
          {(canLeaveLight || footer) && (
            <div className="alert-exit">
              {canLeaveLight && <LeaveAlertButton alertId={alertId} onChange={loadDetail} />}
              {footer}
            </div>
          )}
        </div>
      );
    }
    return error ? <p className="form-error">{error}</p> : null;
  }

  const senderName = (senderId: string) => {
    if (senderId === user?.id) return t('alerts.detail.me');
    const participant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === senderId);
    return participant?.userSentinels.linkAsSentinel.firstName ?? '…';
  };

  const myParticipant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === user?.id);
  const isCompanion = user?.id === detail.userCompanion.id;
  const isFirstCircleSentinel = !isCompanion && myParticipant?.circleId === detail.firstCircleId;
  const isAlertManager = isCompanion || isFirstCircleSentinel;
  const canRequestCircle = isAlertManager && detail.alertStatus !== 'RESOLVED';
  const canRespond = myParticipant?.status === 'CONTACTED' && detail.alertStatus !== 'RESOLVED';
  const canLeave = !!myParticipant && myParticipant.status !== 'CLOSED' && detail.alertStatus !== 'RESOLVED';

  // No "current lead" stored separately — whichever Lead has the latest
  // leadAssignedAt is the one currently driving the alert. Any Lead can
  // claim/reclaim it at any time, no wait window (see claimLead).
  const leadClaims = detail.participants.filter((p) => p.isLead && p.leadAssignedAt);
  const activeLead = leadClaims.length
    ? leadClaims.reduce((a, b) => (a.leadAssignedAt! > b.leadAssignedAt! ? a : b))
    : null;
  const canClaimLead = myParticipant?.isLead && myParticipant.status !== 'CLOSED' && detail.alertStatus !== 'RESOLVED';

  // Who's in the 1st circle, for telling the main chat apart from an
  // isolated one when labeling each entry in detail.conversations below.
  const firstCircleSentinelIds = new Set(
    detail.participants.filter((p) => p.circleId === detail.firstCircleId).map((p) => p.userSentinels.linkAsSentinel.id),
  );

  const labelMeta = detail.labelUpdatedBy ? t('alerts.detail.updatedBy', { name: detail.labelUpdatedBy.firstName }) : undefined;
  const statusFirstCircleMeta = detail.statusUpdatedBy
    ? t('alerts.detail.updatedBy', { name: detail.statusUpdatedBy.firstName })
    : undefined;

  // Each status note is an action for whoever writes it (the companion
  // writes statusByCompanion, any 1st-circle Sentinel statusByFirstCircle)
  // and read-only information for everyone else. Both stay editable after
  // the alert is resolved, unlike the chat, which locks once closed.
  const companionStatus = (
    <StatusNoteField
      label={t('alerts.detail.statusByCompanion')}
      value={detail.statusByCompanion}
      onSave={isCompanion ? (message) => updateAlertStatus(alertId, message).then(loadDetail) : undefined}
    />
  );
  const firstCircleStatus = (
    <StatusNoteField
      label={t('alerts.detail.statusByFirstCircle')}
      value={detail.statusByFirstCircle}
      meta={statusFirstCircleMeta}
      onSave={isFirstCircleSentinel ? (message) => updateAlertStatus(alertId, message).then(loadDetail) : undefined}
    />
  );
  const hasTodo = canRespond || canClaimLead || isAlertManager || canRequestCircle;

  // What this viewer is responsible for here, said in one line above "To do".
  const roleKey = isCompanion
    ? 'companion'
    : myParticipant && activeLead?.id === myParticipant.id
      ? 'activeLead'
      : myParticipant?.isLead
        ? 'lead'
        : isFirstCircleSentinel
          ? 'firstCircle'
          : myParticipant?.status === 'CONTACTED'
            ? 'asked'
            : 'involved';

  return (
    <div className="alert-detail">
      <p className="alert-role">{t(`alerts.detail.role.${roleKey}`)}</p>
      {hasTodo && (
        <AlertSection title={t('alerts.detail.sections.todo')}>
          {canRespond && <RespondButtons alertId={alertId} onChange={loadDetail} />}
          {canClaimLead && (
            <p>
              {activeLead
                ? t('alerts.detail.currentLead', { name: activeLead.userSentinels.linkAsSentinel.firstName })
                : t('alerts.detail.noLeadYet')}{' '}
              <button className="ghost" onClick={() => claimLead(alertId).then(loadDetail)}>
                {t('alerts.detail.claimLead')}
              </button>
            </p>
          )}
          {isCompanion && companionStatus}
          {isFirstCircleSentinel && (
            <>
              {firstCircleStatus}
              {/* The name: any 1st-circle Sentinel can set/rename it. */}
              <StatusNoteField
                label={t('alerts.detail.labelField')}
                value={detail.label}
                placeholder={t('alerts.detail.labelPlaceholder')}
                meta={labelMeta}
                onSave={(label) => updateAlertLabel(alertId, label).then(loadDetail)}
              />
            </>
          )}
          {canRequestCircle && (
            <RequestCircleForm
              alertId={alertId}
              circles={detail.userCompanion.myCircles}
              participants={detail.participants}
              onChange={loadDetail}
            />
          )}
        </AlertSection>
      )}

      <AlertSection title={t('alerts.detail.sections.know')}>
        <AlertMessage text={detail.messageAlert} />
        {!isCompanion && companionStatus}
        {!isFirstCircleSentinel && firstCircleStatus}

        <h3>{t('alerts.detail.participants')}</h3>
        {!canClaimLead && (
          <p>
            {activeLead
              ? t('alerts.detail.currentLead', { name: activeLead.userSentinels.linkAsSentinel.firstName })
              : t('alerts.detail.noLeadYet')}
          </p>
        )}
        <ul>
          {detail.participants.map((p) => (
            <li key={p.id}>
              {p.userSentinels.linkAsSentinel.firstName}
              {p.isLead && <span className="badge">{t('alerts.detail.lead')}</span>}
              {activeLead?.id === p.id && (
                <span className="badge status-accepted">{t('alerts.detail.activeLeadBadge')}</span>
              )}
              <span className="badge">{t(`alerts.detail.participantStatus.${p.status}`)}</span>
              <span style={{ color: 'var(--text-muted)' }}> — {p.circleName}</span>
              {p.requestedBy && (
                <span style={{ color: 'var(--text-muted)' }}> · {t('alerts.detail.requestedBy', { name: p.requestedBy.firstName })}</span>
              )}
              {p.response && (
                <span style={{ color: 'var(--text-muted)' }}> · {t('alerts.detail.response', { response: p.response })}</span>
              )}
            </li>
          ))}
        </ul>

        {detail.timeline.length > 0 && (
          // Folded by default: useful afterwards, noise in the moment.
          <details className="alert-timeline-toggle">
            <summary>{t('alerts.detail.timeline.title')}</summary>
            <ul className="alert-timeline">
              {detail.timeline.map((e, i) => (
                <li key={i}>
                  <span className="badge">{t(`alerts.detail.timeline.event.${e.type}`)}</span>
                  <strong>{e.actorLabel}</strong>
                  {e.detail && <span> — {e.detail}</span>}
                  <span style={{ color: 'var(--text-muted)' }}> · {new Date(e.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </AlertSection>

      {detail.conversations.length > 0 && (
        <AlertSection title={t('alerts.detail.sections.discussion')}>
          {/* One block per conversation on this alert: the main 1st-circle
              chat, plus one per outer-circle Sentinel who's opened an
              isolated chat with the 1st circle. Told apart by participants —
              any conversation with someone outside the 1st circle is an
              isolated one, labeled with their name. */}
          {detail.conversations.map((conv) => {
            const outsider = conv.participants.find((p) => !firstCircleSentinelIds.has(p.user.id));
            const title = outsider
              ? t('alerts.detail.circleChat.withSentinel', { name: outsider.user.firstName })
              : t('alerts.detail.chatTitle');
            if (isCompanion) {
              // Never a ConversationParticipant (by design) — read-only,
              // straight off getAlert() instead of listMessages()/sendMessage(),
              // which would just 403 them.
              return (
                <div className="alert-chat" key={conv.id}>
                  <h3>{title}</h3>
                  {conv.messages.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
                  ) : (
                    <ul className="alert-chat-messages">
                      {conv.messages.map((m) => (
                        <li key={m.id}>
                          <strong>{m.sender.firstName}</strong> : {m.body}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }
            return <ConversationThread key={conv.id} conversationId={conv.id} title={title} resolveSenderName={senderName} />;
          })}
        </AlertSection>
      )}
      {error && <p className="form-error">{error}</p>}

      {(canLeave || footer) && (
        <div className="alert-exit">
          {canLeave && <LeaveAlertButton alertId={alertId} onChange={loadDetail} />}
          {footer}
        </div>
      )}
    </div>
  );
}

function AlertSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="alert-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// Self-contained message list + input + its own message:new socket
// listener for one conversation — used for the main 1st-circle chat, each
// isolated outer-circle chat in the full alert view, and the outer-circle
// Sentinel's own isolated-chat UI below. Hides itself entirely if the
// viewer turns out not to be a participant (e.g. a 1st-circle Sentinel
// excluded from their own circle's chat) rather than showing a bare error.
function ConversationThread({
  conversationId,
  title,
  resolveSenderName,
}: {
  conversationId: string;
  title: string;
  resolveSenderName: (senderId: string) => string;
}) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setMessages(await listMessages(conversationId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) void reload();
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(conversationId, draft.trim());
      setDraft('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const submitImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSending(true);
    try {
      await sendImageMessage(conversationId, file);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading || forbidden) return null;

  return (
    <div className="alert-chat">
      <h3>{title}</h3>
      {messages && messages.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
      ) : (
        <ul className="alert-chat-messages">
          {messages?.map((m) => (
            <li key={m.id}>
              <strong>{m.senderId === user?.id ? t('alerts.detail.me') : resolveSenderName(m.senderId)}</strong> :{' '}
              {m.type === 'IMAGE' ? (
                <img src={`${API_URL}/uploads/messages/${m.body}`} alt="" style={{ maxWidth: 200, borderRadius: 8, display: 'block' }} />
              ) : (
                m.body
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={submit}>
        <input
          placeholder={t('alerts.detail.messagePlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {t('alerts.detail.send')}
        </button>
        <input type="file" accept="image/*" disabled={sending} onChange={submitImage} />
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// The outer-circle Sentinel's own request-then-chat UI, in the
// myParticipation fallback view — starts as a button (lazy, so just
// viewing the alert doesn't create a conversation), opens into a
// ConversationThread once requested. Any 1st-circle sender is shown
// generically ("1st circle"): this caller never sees the 1st circle's
// own roster.
function CircleChatSection({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!conversationId) {
    return (
      <section className="panel">
        <button
          onClick={() =>
            requestCircleChat(alertId)
              .then((c) => setConversationId(c.id))
              .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
          }
        >
          {t('alerts.detail.circleChat.title')}
        </button>
        {error && <p className="form-error">{error}</p>}
      </section>
    );
  }

  return (
    <ConversationThread
      conversationId={conversationId}
      title={t('alerts.detail.circleChat.title')}
      resolveSenderName={() => t('alerts.detail.circleChat.firstCircleSender')}
    />
  );
}

// A labeled text field (the alert's name, or one side's live status note);
// editable in place only when `onSave` is given (i.e. the caller is allowed
// to write it). `meta`, when given, shows who last wrote the current value.
function StatusNoteField({
  label,
  value,
  placeholder,
  meta,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  meta?: string;
  onSave?: (message: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  if (editing && onSave) {
    const save = async () => {
      if (!draft.trim()) return;
      setSaving(true);
      try {
        await onSave(draft.trim());
        setEditing(false);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="row">
        <input
          placeholder={placeholder ?? t('alerts.detail.status.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button onClick={save} disabled={saving || !draft.trim()}>
          {t('common.save')}
        </button>
        <button className="ghost" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <p>
      <strong>{label} :</strong> {value ?? <span style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.status.none')}</span>}{' '}
      {value && meta && <span style={{ color: 'var(--text-muted)' }}>{meta}</span>}{' '}
      {onSave && (
        <button
          className="ghost"
          onClick={() => {
            setDraft(value ?? '');
            setEditing(true);
          }}
        >
          {t('common.edit')}
        </button>
      )}
    </p>
  );
}

function RespondButtons({ alertId, onChange }: { alertId: string; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <Tile>
      <p>{t('alerts.detail.respond.prompt')}</p>
      <div className="row">
        <button onClick={() => respondToAlert(alertId, true).then(onChange)}>{t('alerts.detail.respond.yes')}</button>
        <button className="ghost" onClick={() => respondToAlert(alertId, false).then(onChange)}>
          {t('alerts.detail.respond.no')}
        </button>
      </div>
    </Tile>
  );
}

// Backend messages the leave flow can hit, shown translated instead of raw.
const LEAVE_ERRORS: Record<string, string> = {
  'Another Lead must take the lead before you leave this alert': 'alerts.detail.leave.needOtherLead',
};

function LeaveAlertButton({ alertId, onChange }: { alertId: string; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    if (!window.confirm(t('alerts.detail.leave.confirm'))) return;
    setError(null);
    try {
      await leaveAlert(alertId);
      await onChange();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setError(LEAVE_ERRORS[message] ? t(LEAVE_ERRORS[message]) : message);
    }
  };

  return (
    <div>
      <button className="ghost" onClick={leave}>
        {t('alerts.detail.leave.button')}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function RequestCircleForm({
  alertId,
  circles,
  participants,
  onChange,
}: {
  alertId: string;
  circles: { id: string; label: string }[];
  participants: AlertParticipant[];
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [circleId, setCircleId] = useState(circles[0]?.id ?? '');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once a circle has at least one contacted member, calling this again is
  // "contact more" (the next batch of 2), not the original ask.
  const isRepeatRequest = participants.some(
    (p) => p.circleId === circleId && p.status !== 'WAITING',
  );

  if (circles.length === 0) {
    return (
      <section className="panel">
        <h3>{t('alerts.detail.requestCircle.title')}</h3>
        <div className="empty-state">{t('alerts.detail.requestCircle.noCircles')}</div>
      </section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestCircle(alertId, { circleId, question: question.trim() });
      setQuestion('');
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <h3>{t('alerts.detail.requestCircle.title')}</h3>
      <div className="row wrap">
        <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          required
          placeholder={t('alerts.detail.requestCircle.questionPlaceholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={submitting || !circleId || !question.trim()}>
          {t(
            isRepeatRequest
              ? 'alerts.detail.requestCircle.submitMore'
              : 'alerts.detail.requestCircle.submit',
          )}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

// What was written when the alert was launched (Alert.messageAlert).
function AlertMessage({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="alert-message">
      <strong>{t('alerts.detail.messageAlert')}</strong>
      <p>{text}</p>
    </div>
  );
}
