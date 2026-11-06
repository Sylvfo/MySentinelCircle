import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import {
  claimLead,
  closeAlert,
  getAlert,
  getMyParticipation,
  leaveAlert,
  listAlerts,
  markFound,
  raiseAlert,
  requestCircleChat,
  updateAlertLocation,
  updateAlertLabel,
  updateAlertStatus,
  type AlertDetail,
  type AlertLocation,
  type AlertSummary,
  type AlertType,
  type FoundFollowUp,
  type MyAlertSummary,
  type MyParticipation,
} from '../api/alert';
import { APPROXIMATE_ACCURACY_M, formatAccuracy, useLocate } from '../geolocation';
import { LinkifiedText } from '../components/LinkifiedText';
import { listCompanions, type Companion } from '../api/sentinel';
import { updatePause } from '../api/user';
import { listMessages, sendImageMessage, sendMessage, type Message } from '../api/messaging';
import { Modal } from '../components/Modal';
import { AlertReplyPanel } from '../components/AlertReplyPanel';
import { replyLabel } from '../components/replyLabel';
import { Tile } from '../components/Tile';
import { PersonAvatar } from '../components/PersonAvatar';
import { MessageBubbles } from '../components/MessageBubbles';
import { EmojiButton } from '../components/EmojiButton';
import { AlertCircleTiles, AlertRepliesTimeline } from '../components/AlertCircles';
import { AlertSteps, RoleBanner, WelcomeModal, type GuideRole } from '../components/AlertGuide';
import { PRIMARY_AVATAR_COLOR, PRIMARY_LEAD_COLOR } from '../theme';

// The 4 ways to raise an alert, one tile each. "For myself" is always
// BYCOMPANION; the two "for someone I watch over" tiles map to one type each;
// travel mode isn't built yet. LITTLEWORRY/EMERGENCY/NOCONTACT/UNKNOWN still
// exist in the schema but aren't offered from here.
type RaiseKind = 'self' | 'missing' | 'assistance';
const RAISE_TYPE: Record<RaiseKind, AlertType> = {
  self: 'BYCOMPANION',
  missing: 'MISSING',
  assistance: 'INCIDENT',
};

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
            <p>{t('alerts.tiles.missing.hint')}</p>
          </Tile>
        </Link>
        <Link to="/alerts/assistance" className="tile-link">
          <Tile title={t('alerts.tiles.assistance.title')}>
            <p>{t('alerts.tiles.assistance.hint')}</p>
          </Tile>
        </Link>
        {/* Not built yet — shown so people know it's coming, not clickable. */}
        <Tile className="tile-soon" title={t('alerts.tiles.travel.title')}>
          <p>{t('alerts.tiles.travel.hint')}</p>
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
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const forSelf = kind === 'self';
  // On pause for others, raising for someone whose 1st circle I'm in: I'd
  // be left out of my own alert — so I'm asked first whether to lift my
  // pause and take part, or raise it without taking part.
  const [askPause, setAskPause] = useState(false);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loadingCompanions, setLoadingCompanions] = useState(!forSelf);
  const [companionId, setCompanionId] = useState('');
  const [situation, setSituation] = useState('');
  const [needs, setNeeds] = useState('');
  const [status, setStatus] = useState('');
  // My GPS position, only if I tap "Add my position" (alert for myself).
  const [location, setLocation] = useState<AlertLocation | null>(null);
  const { locate: findPosition, locating, error: locateError } = useLocate();
  const locate = () => void findPosition().then((loc) => loc && setLocation(loc));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forSelf) return;
    // Any Sentinel (any circle) is authorized to raise — it always notifies
    // the companion's 1st circle regardless of which circle the raiser is in.
    listCompanions()
      .then((all) => {
        setCompanions(all);
        // Someone on pause for me can't be alerted by anyone else.
        const first = all.find((c) => !c.companion.pausedForMe);
        if (first) setCompanionId(first.companion.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoadingCompanions(false));
  }, [forSelf]);

  const canWriteStatus = forSelf || !!companions.find((c) => c.companion.id === companionId)?.circle.isPrimary;

  const pausedInTheirFirstCircle =
    !forSelf &&
    !!user?.pausedForOthers &&
    !!companions.find((c) => c.companion.id === companionId)?.circle.isPrimary;

  const raise = async (join = true) => {
    const targetId = forSelf ? user?.id : companionId;
    if (!targetId) return;
    setSubmitting(true);
    setError(null);
    const reason = [situation.trim(), needs.trim() && `${t('alerts.self.needsPrefix')} ${needs.trim()}`]
      .filter(Boolean)
      .join('\n\n');
    try {
      if (pausedInTheirFirstCircle && join) {
        await updatePause({ pausedForOthers: false });
        await refreshUser();
      }
      const alert = await raiseAlert({
        companionId: targetId,
        alertType: RAISE_TYPE[kind],
        reason: reason || t('alerts.defaultReason'),
        ...(forSelf && location ? { location } : {}),
      });
      if (canWriteStatus && status.trim()) await updateAlertStatus(alert.id, status.trim());
      // Not taking part: there's no running alert for me to follow.
      navigate(pausedInTheirFirstCircle && !join ? '/dashboard' : '/running-alert');
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
                <option key={c.linkId} value={c.companion.id} disabled={c.companion.pausedForMe}>
                  {[c.companion.firstName, c.companion.lastName].filter(Boolean).join(' ')}
                  {c.companion.pausedForMe ? ` — ${t('pause.raiseOption')}` : ''}
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
        {forSelf && (
          <div className="alert-location">
            {location ? (
              <>
                <p>
                  📍 {t('alerts.location.added', { accuracy: formatAccuracy(location.accuracy ?? 0) })}{' '}
                  <button type="button" className="link-button" onClick={() => setLocation(null)}>
                    {t('alerts.location.remove')}
                  </button>
                </p>
                <ApproximateWarning location={location} />
              </>
            ) : (
              <button type="button" className="ghost" disabled={locating} onClick={locate}>
                📍 {locating ? t('alerts.location.locating') : t('alerts.location.add')}
              </button>
            )}
            <small>{locateError ? t(`alerts.location.${locateError}`) : t('alerts.location.hint')}</small>
          </div>
        )}
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
        {askPause && pausedInTheirFirstCircle ? (
          <div className="pause-raise-choice">
            <p>{t('pause.raise.question')}</p>
            <button className="alert-btn" disabled={submitting} onClick={() => void raise(true)}>
              {t('pause.raise.join')}
            </button>
            <button type="button" className="link-button" disabled={submitting} onClick={() => void raise(false)}>
              {t('pause.raise.withoutMe')}
            </button>
          </div>
        ) : (
          <button
            className="alert-btn"
            disabled={submitting || (forSelf ? !user : !companionId)}
            onClick={() => (pausedInTheirFirstCircle ? setAskPause(true) : void raise())}
          >
            {forSelf ? t('alerts.raiseForSelf') : t('alerts.submit')}
          </button>
        )}
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
// `view: 'chat'` renders only the alert's conversations — the Running Alert
// page shows them on their own page, reached from a button in its header.
export function AlertDetailPanel({
  alertId,
  footer,
  view = 'main',
}: {
  alertId: string;
  footer?: ReactNode;
  view?: 'main' | 'chat';
}) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [foundOpen, setFoundOpen] = useState(false);
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
      // An outer circle answers the questions it was asked — nothing to show
      // without any, or once they've left the alert.
      const canRespondLight =
        myParticipation.questions.length > 0 &&
        myParticipation.status !== 'WAITING' &&
        myParticipation.status !== 'CLOSED' &&
        myParticipation.alert.alertStatus !== 'RESOLVED';
      const canChat =
        !!myParticipation.alertChatWithFirstCircleAtAlert &&
        myParticipation.alert.alertStatus !== 'RESOLVED';
      const canLeaveLight = myParticipation.status !== 'CLOSED' && myParticipation.alert.alertStatus !== 'RESOLVED';
      const lightVars = {
        name: myParticipation.alert.userCompanion.firstName,
        lead: '',
        followUp: '',
      };
      if (view === 'chat') {
        return canChat ? <CircleChatSection alertId={alertId} /> : null;
      }
      return (
        <div className="alert-detail">
          {canRespondLight ? (
            <>
              <WelcomeModal alertId={alertId} role="asked" vars={lightVars} />
              <RoleBanner role="asked" vars={lightVars} />
            </>
          ) : (
            <p className="alert-role">
              {myParticipation.status === 'CONTACTED'
                ? t('alerts.detail.role.asked')
                : myParticipation.status === 'CLOSED'
                  ? t('alerts.detail.role.left')
                  : t('alerts.detail.role.involved')}
            </p>
          )}
          {canRespondLight && (
            <AlertSection title={t('alerts.detail.sections.todo')}>
              <AlertReplyPanel alertId={alertId} questions={myParticipation.questions} onChange={loadDetail} />
            </AlertSection>
          )}
          {/* Outside the 1st circle: no alert details (no launch message, no
              roster) — only the statuses and my own answer. */}
          <AlertSection title={t('alerts.detail.sections.know')}>
            <StatusNoteField label={t('alerts.detail.statusByCompanion')} value={myParticipation.alert.statusByCompanion} />
            <StatusNoteField label={t('alerts.detail.statusByFirstCircle')} value={myParticipation.alert.statusByFirstCircle} />
            <p>
              <strong>{t('alerts.detail.myResponse')}</strong>{' '}
              {myParticipation.response ? replyLabel(t, myParticipation.response) : t('alerts.detail.noResponseYet')}
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
    // The person the alert is about writes in the room too.
    if (senderId === detail.userCompanion.id) return detail.userCompanion.firstName;
    const participant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === senderId);
    return participant?.userSentinels.linkAsSentinel.firstName ?? '…';
  };

  // A name in the room opens that person's page, with their place in this alert.
  const senderLink = (senderId: string) =>
    senderId === user?.id ? null : `/people/${senderId}?alert=${alertId}`;

  const myParticipant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === user?.id);
  const isCompanion = user?.id === detail.userCompanion.id;
  const isFirstCircleSentinel = !isCompanion && myParticipant?.circleId === detail.firstCircleId;
  const isAlertManager = isCompanion || isFirstCircleSentinel;
  const canRequestCircle = isAlertManager && detail.alertStatus !== 'RESOLVED';
  const canRespond =
    !!myParticipant && myParticipant.status !== 'WAITING' && detail.alertStatus !== 'RESOLVED';
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

  // The guidance (welcome pop-up, "Your role", steps) while the alert runs.
  // Once the person is found (CLOSING), the 1st circle's job becomes the
  // follow-up the responsible Lead decided — stored as the 1st circle's
  // status note by markFound.
  const running = detail.alertStatus !== 'RESOLVED';
  const guideRole: GuideRole | null = !running
    ? null
    : isCompanion
      ? 'companion'
      : !isFirstCircleSentinel
        ? null
        : detail.alertStatus === 'CLOSING'
          ? 'found'
          : roleKey === 'activeLead' || roleKey === 'lead'
            ? roleKey
            : 'firstCircle';
  const guideVars = {
    name: detail.userCompanion.firstName,
    lead: activeLead?.userSentinels.linkAsSentinel.firstName ?? '',
    // markFound writes "Personne retrouvée : <follow-up>" — the banner
    // already says the person was found, so only the follow-up is kept.
    followUp: (detail.statusByFirstCircle ?? '').replace(/^Personne retrouvée : /, ''),
  };

  // Chat page only: who's in the 1st circle, with photo, role and status in
  // this alert — tapping one opens their person page (alert context).
  const firstCircleRoster = detail.participants.filter((p) => p.circleId === detail.firstCircleId);
  const roster = view === 'chat' && firstCircleRoster.length > 0 && (
    <div className="alert-roster" aria-label={t('alerts.detail.roster')}>
      {firstCircleRoster.map((p) => (
        <Link
          key={p.id}
          to={`/people/${p.userSentinels.linkAsSentinel.id}?alert=${alertId}`}
          className="alert-roster-person"
        >
          <PersonAvatar
            userId={p.userSentinels.linkAsSentinel.id}
            avatarPath={p.userSentinels.linkAsSentinel.avatarPath}
            paused={p.userSentinels.linkAsSentinel.pausedForOthers}
            sentinelColor={p.isLead ? PRIMARY_LEAD_COLOR : PRIMARY_AVATAR_COLOR}
            companionColor={null}
            size={44}
          />
          <span className="alert-roster-name">
            {p.userSentinels.linkAsSentinel.id === user?.id ? t('alerts.detail.me') : p.userSentinels.linkAsSentinel.firstName}
          </span>
          <span className="alert-roster-role">
            {activeLead?.id === p.id
              ? t('alerts.detail.activeLeadBadge')
              : p.isLead
                ? t('alerts.detail.lead')
                : t(`alerts.detail.participantStatus.${p.status}`)}
          </span>
        </Link>
      ))}
    </div>
  );

  const conversations = (
    <div className="alert-detail">
      {view === 'chat' && (
        <>
          {/* The responsible Lead (Lead 1 from the start, decided in advance):
              the whole 1st circle acts together, but "person found + what
              next" is theirs. Another Lead can take over if they can't. */}
          <div className="lead-box">
            <p>
              {activeLead
                ? t('alerts.detail.currentLead', {
                    name: activeLead.userSentinels.linkAsSentinel.firstName,
                  })
                : t('alerts.detail.noLeadYet')}
            </p>
            <p className="form-hint">{t('alerts.detail.leadExplain')}</p>
            <div className="row">
              {activeLead && myParticipant && activeLead.id === myParticipant.id && detail.alertStatus !== 'RESOLVED' && (
                <button onClick={() => setFoundOpen(true)}>{t('alerts.detail.found.button')}</button>
              )}
              {canClaimLead && activeLead?.id !== myParticipant?.id && (
                <button
                  className="ghost"
                  onClick={() => {
                    if (window.confirm(t('alerts.detail.takeOverConfirm'))) void claimLead(alertId).then(loadDetail);
                  }}
                >
                  {t('alerts.detail.claimLead')}
                </button>
              )}
            </div>
          </div>
          {foundOpen && (
            <FoundModal
              alertId={alertId}
              onClose={() => setFoundOpen(false)}
              onDone={() => {
                setFoundOpen(false);
                void loadDetail();
              }}
            />
          )}

          {/* The alert's info, editable by whoever writes it: its name (any
              1st-circle Sentinel), the launch message, both status notes. The
              main page only shows the statuses, read-only, in its header. */}
          <div className="room-info">
            <StatusNoteField
              label={t('alerts.detail.labelField')}
              value={detail.label}
              placeholder={t('alerts.detail.labelPlaceholder')}
              meta={labelMeta}
              onSave={isFirstCircleSentinel ? (label) => updateAlertLabel(alertId, label).then(loadDetail) : undefined}
            />
            {companionStatus}
            {firstCircleStatus}
            <AlertMessage text={detail.messageAlert} />
            {isCompanion && running && <UpdateMyPosition alertId={alertId} onDone={loadDetail} />}
          </div>
        </>
      )}
      {roster}
      {detail.conversations.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
      ) : (
        <>
          {/* One block per conversation on this alert: the main 1st-circle
              chat, plus one per outer-circle Sentinel who's opened an
              isolated chat with the 1st circle. Told apart by participants —
              any conversation with someone outside the 1st circle is an
              isolated one, labeled with their name. */}
          {detail.conversations.map((conv) => {
            // The companion is in the room too: not an outsider.
            const outsider = conv.participants.find(
              (p) => !firstCircleSentinelIds.has(p.user.id) && p.user.id !== detail.userCompanion.id,
            );
            const title = outsider
              ? t('alerts.detail.circleChat.withSentinel', {
                  name: outsider.user.firstName,
                })
              : t('alerts.detail.chatTitle');
            if (isCompanion && !conv.participants.some((p) => p.user.id === user?.id)) {
              // The companion writes in every chat of their alert; only an
              // old one they were never seated in (e.g. in History) stays
              // read-only — straight off getAlert(), listMessages() would
              // 403 them.
              return (
                <div className="alert-chat" key={conv.id}>
                  <h3>{title}</h3>
                  {conv.messages.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
                  ) : (
                    <MessageBubbles
                      messages={conv.messages.map((m) => ({ ...m, type: 'TEXT' as const, senderId: m.sender.id }))}
                      myId={user?.id}
                      nameOf={(id) => conv.messages.find((m) => m.sender.id === id)?.sender.firstName ?? '…'}
                    />
                  )}
                </div>
              );
            }
            // The main 1st-circle chat on the chat page reads like any
            // conversation (composer fixed at the bottom); isolated chats
            // stay inline below it.
            return (
              <ConversationThread
                key={conv.id}
                conversationId={conv.id}
                title={title}
                resolveSenderName={senderName}
                // Only the companion and the 1st circle can read the alert:
                // for an outer-circle Sentinel the person page couldn't
                // show the others, so their names stay plain.
                senderLink={isAlertManager ? senderLink : undefined}
                fullPage={view === 'chat' && !outsider}
              />
            );
          })}
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
  if (view === 'chat') return conversations;

  return (
    <div className="alert-detail">
      {running && <AlertSteps status={detail.alertStatus} />}
      {guideRole ? (
        <>
          <WelcomeModal alertId={alertId} role={guideRole} vars={guideVars} />
          <RoleBanner role={guideRole} vars={guideVars} />
        </>
      ) : (
        <p className="alert-role">{t(`alerts.detail.role.${roleKey}`)}</p>
      )}
      {/* The person the alert is about: "all fine, stop the alert" first. */}
      {isCompanion && running && footer}
      {/* My own answer stays in view, at the top. */}
      {canRespond && myParticipant && (
        <AlertReplyPanel
          alertId={alertId}
          name={detail.userCompanion.firstName}
          alertType={detail.alertType}
          firstCircleResponse={myParticipant.circleId === detail.firstCircleId ? myParticipant.response : undefined}
          questions={myParticipant.questions}
          onChange={loadDetail}
        />
      )}
      {/* Once a 1st-circle Sentinel has answered: where to find what. */}
      {running && isFirstCircleSentinel && myParticipant?.response && (
        <section className="where-card">
          <h3>{t('alerts.where.title', { name: detail.userCompanion.firstName })}</h3>
          <ol>
            <li>
              <strong>{t('alerts.where.roomTitle')}</strong> {t('alerts.where.room')}
            </li>
            <li>
              <strong>{t('alerts.where.repliesTitle')}</strong> {t('alerts.where.replies')}
            </li>
            <li>
              <strong>{t('alerts.where.circlesTitle')}</strong>{' '}
              {t('alerts.where.circles', { name: detail.userCompanion.firstName })}
            </li>
          </ol>
          <Link to={`/running-alert/${alertId}/chat`} className="button-link">
            {t('alerts.where.openRoom')}
          </Link>
        </section>
      )}

      <AlertSection title={t('alerts.detail.sections.replies')}>
        <AlertRepliesTimeline detail={detail} />
      </AlertSection>

      <AlertSection title={t('alerts.detail.sections.circles')}>
        <AlertCircleTiles detail={detail} canAct={canRequestCircle} onChange={loadDetail} />
      </AlertSection>

      {error && <p className="form-error">{error}</p>}

      {(canLeave || footer) && (
        <div className="alert-exit">
          {canLeave && <LeaveAlertButton alertId={alertId} onChange={loadDetail} />}
          {!(isCompanion && running) && footer}
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

// Person found + what next: the responsible Lead's decision. "Fine" ends
// the alert; the other choices keep it open (being closed) with the
// follow-up shown to everyone, until the 1st circle closes it.
function FoundModal({ alertId, onClose, onDone }: { alertId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [followUp, setFollowUp] = useState<FoundFollowUp>('FINE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await markFound(alertId, followUp, note.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('alerts.detail.found.title')} onClose={onClose}>
      <form className="found-form" onSubmit={submit}>
        <p className="form-hint">{t('alerts.detail.found.intro')}</p>
        {(['FINE', 'PICKUP', 'REPATRIATION', 'CARE'] as const).map((f) => (
          <label key={f} className={`found-option${followUp === f ? ' selected' : ''}`}>
            <input type="radio" name="followUp" value={f} checked={followUp === f} onChange={() => setFollowUp(f)} />
            <span>
              <strong>{t(`alerts.detail.found.options.${f}.title`)}</strong>
              <small>{t(`alerts.detail.found.options.${f}.hint`)}</small>
            </span>
          </label>
        ))}
        {followUp !== 'FINE' && (
          <textarea
            id="found-note"
            rows={2}
            maxLength={300}
            placeholder={t('alerts.detail.found.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            {followUp === 'FINE' ? t('alerts.detail.found.submitClose') : t('alerts.detail.found.submit')}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </Modal>
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
  senderLink,
  fullPage = false,
}: {
  conversationId: string;
  title: string;
  resolveSenderName: (senderId: string) => string;
  senderLink?: (senderId: string) => string | null;
  // The alert's chat page: same layout as a Messages conversation — composer
  // (+ menu, paper plane) fixed at the bottom, page opening at the bottom.
  fullPage?: boolean;
}) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Full page: keep the newest message in view (above the fixed composer).
  useEffect(() => {
    if (fullPage && messages) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [fullPage, messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <MessageBubbles messages={messages ?? []} myId={user?.id} nameOf={resolveSenderName} linkOf={senderLink} />
      )}
      {fullPage ? (
        <form className="conversation-compose" autoComplete="off" onSubmit={submit}>
          <div className="compose-attach">
            <button
              type="button"
              className="compose-icon-btn"
              aria-label={t('conversation.attach')}
              aria-expanded={attachOpen}
              disabled={sending}
              onClick={() => setAttachOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {attachOpen && (
              <div className="compose-attach-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAttachOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.6" />
                    <path d="M21 16 L15.5 11 L6 19" />
                  </svg>
                  {t('conversation.attachPhoto')}
                </button>
              </div>
            )}
          </div>
          <input
            id={`thread-draft-${conversationId}`}
            autoComplete="off"
            className="compose-input"
            placeholder={t('alerts.detail.messagePlaceholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <EmojiButton onPick={(emoji) => setDraft((d) => d + emoji)} />
          <button
            type="submit"
            className="compose-icon-btn compose-send"
            aria-label={t('alerts.detail.send')}
            disabled={sending || !draft.trim()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M3 11.2 L20.5 3.5 C21.2 3.2 21.8 3.8 21.5 4.5 L13.8 22 C13.5 22.7 12.5 22.6 12.3 21.9 L10.4 14.6 L3.1 12.7 C2.4 12.5 2.3 11.5 3 11.2 Z" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden disabled={sending} onChange={submitImage} />
        </form>
      ) : (
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
      )}
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

// What was written when the alert was launched (Alert.messageAlert).
function AlertMessage({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="alert-message">
      <strong>{t('alerts.detail.messageAlert')}</strong>
      <p>
        <LinkifiedText text={text} />
      </p>
    </div>
  );
}

// Says so when the position is only a rough guess — it's still sent.
function ApproximateWarning({ location }: { location: AlertLocation }) {
  const { t } = useTranslation();
  if ((location.accuracy ?? 0) <= APPROXIMATE_ACCURACY_M) return null;
  return (
    <p className="alert-location-warning">
      ⚠ {t('alerts.location.approximate', { accuracy: formatAccuracy(location.accuracy ?? 0) })}
    </p>
  );
}

// In my own running alert: send where I am now, as often as I like.
function UpdateMyPosition({ alertId, onDone }: { alertId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { locate, locating, error } = useLocate();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<AlertLocation | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const update = async () => {
    setSendError(null);
    const loc = await locate();
    if (!loc) return;
    setSending(true);
    try {
      await updateAlertLocation(alertId, loc);
      setSent(loc);
      onDone();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="alert-location">
      <button type="button" className="ghost" disabled={locating || sending} onClick={() => void update()}>
        📍 {locating ? t('alerts.location.locating') : t('alerts.location.update')}
      </button>
      {sent && <small>✓ {t('alerts.location.updated', { accuracy: formatAccuracy(sent.accuracy ?? 0) })}</small>}
      {sent && <ApproximateWarning location={sent} />}
      {error && <small>{t(`alerts.location.${error}`)}</small>}
      {sendError && <p className="form-error">{sendError}</p>}
    </div>
  );
}
