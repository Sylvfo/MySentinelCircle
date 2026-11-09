import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorText } from '../api/client';
import {
  getAlert,
  getMyParticipation,
  updateAlertLabel,
  updateAlertStatus,
  type AlertDetail,
  type MyParticipation,
} from '../api/alert';
import { LinkifiedText } from './LinkifiedText';
import { isChatClosed } from '../api/messaging';
import { AlertReplyPanel } from './AlertReplyPanel';
import { replyLabel } from './replyLabel';
import { PersonAvatar } from './PersonAvatar';
import { MessageBubbles } from './MessageBubbles';
import { AlertCircleTiles, AlertRepliesTimeline } from './AlertCircles';
import { AlertSteps, RoleBanner, WelcomeModal, type GuideRole } from './AlertGuide';
import { PRIMARY_AVATAR_COLOR, PRIMARY_LEAD_COLOR } from '../theme';
import { genderContext } from '../gender';
import { useSocketEvent } from '../realtime/useSocketEvent';
import { Loading } from './Loading';
import { ConversationThread } from './ConversationThread';
import {
  CircleChatSection,
  LeaveAlertButton,
  StatusNoteField,
  TakeOverButton,
  UpdateMyPosition,
} from './AlertDetailActions';

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
  conversationId,
}: {
  alertId: string;
  footer?: ReactNode;
  view?: 'main' | 'chat';
  // Chat view in Messages: only this conversation (the 1st-circle room);
  // each isolated chat has its own page there.
  conversationId?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
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
          setError(errorText(fallbackErr));
          return;
        }
      }
      setError(errorText(err));
    }
  };

  useEffect(() => {
    void loadDetail().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  useSocketEvent('alert:changed', (payload: { alertId: string }) => {
    if (payload.alertId === alertId) void loadDetail();
  });

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

  useSocketEvent('message:new', (payload: { conversationId: string }) => {
    if (detailRef.current?.conversations.some((c) => c.id === payload.conversationId)) {
      void loadDetail();
    }
  });

  if (loading) return <Loading />;

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
        !!myParticipation.alertChatWithFirstCircleAtAlert && myParticipation.alert.alertStatus !== 'RESOLVED';
      const canLeaveLight = myParticipation.status !== 'CLOSED' && myParticipation.alert.alertStatus !== 'RESOLVED';
      const lightVars = {
        name: myParticipation.alert.userCompanion.firstName,
        lead: '',
        context: genderContext(myParticipation.alert.userCompanion.gender),
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
              <AlertReplyPanel
                alertId={alertId}
                name={myParticipation.alert.userCompanion.firstName}
                gender={myParticipation.alert.userCompanion.gender}
                questions={myParticipation.questions}
                onChange={loadDetail}
              />
            </AlertSection>
          )}
          {/* Outside the 1st circle: no alert details (no launch message, no
              roster) — only the statuses and my own answer. */}
          <AlertSection title={t('alerts.detail.sections.know')}>
            <StatusNoteField
              label={t('alerts.detail.statusByCompanion')}
              value={myParticipation.alert.statusByCompanion}
            />
            <StatusNoteField
              label={t('alerts.detail.statusByFirstCircle')}
              value={myParticipation.alert.statusByFirstCircle}
            />
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
  const senderLink = (senderId: string) => (senderId === user?.id ? null : `/people/${senderId}?alert=${alertId}`);

  const myParticipant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === user?.id);
  const isCompanion = user?.id === detail.userCompanion.id;
  const isFirstCircleSentinel = !isCompanion && myParticipant?.circleId === detail.firstCircleId;
  const isAlertManager = isCompanion || isFirstCircleSentinel;
  const canRequestCircle = isAlertManager && detail.alertStatus !== 'RESOLVED';
  const canRespond = !!myParticipant && myParticipant.status !== 'WAITING' && detail.alertStatus !== 'RESOLVED';
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
    detail.participants
      .filter((p) => p.circleId === detail.firstCircleId)
      .map((p) => p.userSentinels.linkAsSentinel.id),
  );

  const labelMeta = detail.labelUpdatedBy
    ? t('alerts.detail.updatedBy', { name: detail.labelUpdatedBy.firstName })
    : undefined;
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
  const running = detail.alertStatus !== 'RESOLVED';
  const guideRole: GuideRole | null = !running
    ? null
    : isCompanion
      ? 'companion'
      : !isFirstCircleSentinel
        ? null
        : roleKey === 'activeLead' || roleKey === 'lead'
          ? roleKey
          : 'firstCircle';
  const guideVars = {
    name: detail.userCompanion.firstName,
    // "retrouvée / retrouvé": how texts speak about them.
    context: genderContext(detail.userCompanion.gender),
    lead: activeLead?.userSentinels.linkAsSentinel.firstName ?? '',
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
            {p.userSentinels.linkAsSentinel.id === user?.id
              ? t('alerts.detail.me')
              : p.userSentinels.linkAsSentinel.firstName}
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
          {/* The responsible Lead (Lead 1 from the start, decided in advance)
              coordinates; the whole 1st circle acts together, and anyone in
              it can stop the alert. Another Lead can take over. */}
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
              {canClaimLead && activeLead?.id !== myParticipant?.id && (
                <TakeOverButton alertId={alertId} onDone={loadDetail} />
              )}
            </div>
          </div>

          {/* The alert's info, editable by whoever writes it: its name (any
              1st-circle Sentinel), the launch message, both status notes. The
              main page only shows the statuses, read-only, in its header. */}
          <div className="room-info">
            <StatusNoteField
              label={t('alerts.detail.labelField')}
              value={detail.label}
              placeholder={t('alerts.detail.labelPlaceholder')}
              meta={labelMeta}
              maxLength={120}
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
        <p className="muted">{t('alerts.detail.noMessages')}</p>
      ) : (
        <>
          {/* One block per conversation on this alert: the main 1st-circle
              chat, plus one per outer-circle Sentinel who's opened an
              isolated chat with the 1st circle. Told apart by participants —
              any conversation with someone outside the 1st circle is an
              isolated one, labeled with their name. */}
          {detail.conversations
            .filter((conv) => !conversationId || conv.id === conversationId)
            .map((conv) => {
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
                      <p className="muted">{t('alerts.detail.noMessages')}</p>
                    ) : (
                      <MessageBubbles
                        messages={conv.messages.map((m) => ({
                          ...m,
                          type: 'TEXT' as const,
                          senderId: m.sender.id,
                        }))}
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
                  // 7 days after the alert closed: read-only.
                  readOnly={isChatClosed(conv)}
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
          gender={detail.userCompanion.gender}
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
              {t('alerts.where.circles', {
                name: detail.userCompanion.firstName,
              })}
            </li>
          </ol>
          <Link to={`/running-alert/${alertId}/chat`} className="button-link">
            {t('alerts.where.openRoom')}
          </Link>
        </section>
      )}

      <AlertSection title={t('alerts.detail.sections.replies')} collapsible>
        <AlertRepliesTimeline detail={detail} />
      </AlertSection>

      <AlertSection title={t('alerts.detail.sections.circles')} collapsible>
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

// `collapsible`: closed at first, opens on a tap on its title (the long
// parts of the page, so the rest stays readable).
function AlertSection({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details className="alert-section collapsible">
        <summary>
          <h2>{title}</h2>
        </summary>
        {children}
      </details>
    );
  }
  return (
    <section className="alert-section">
      <h2>{title}</h2>
      {children}
    </section>
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
