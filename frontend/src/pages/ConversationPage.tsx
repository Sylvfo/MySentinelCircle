import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import { listAlerts, type MyAlertSummary } from '../api/alert';
import { NOTIFICATIONS_CHANGED } from '../api/notification';
import {
  getDirectConversation,
  listMessages,
  listMyConversations,
  type Message,
} from '../api/messaging';
import { ChatComposer } from '../components/ChatComposer';
import { CallButton } from '../components/CallButton';
import { PersonAvatar } from '../components/PersonAvatar';
import { CircleChip } from '../components/CircleChip';
import { SentinelIcon } from '../components/SentinelIcon';
import { CompanionIcon } from '../components/CompanionIcon';
import { MessageBubbles } from '../components/MessageBubbles';
import { relationOf } from '../relations';
import { NameStar } from '../components/SubscribedStar';
import { useSocketEvent } from '../realtime/useSocketEvent';
import { Loading } from '../components/Loading';

// Everything known about the other person, from both directions of the
// relationship: they can be my Sentinel, someone I watch over, or both.
interface ContactInfo {
  firstName: string;
  lastName: string | null;
  userName: string | null;
  phone: string | null;
  email: string | null;
  // They watch over me, in this circle of mine.
  asMySentinel: { circle: string; isLead: boolean; isFirstCircle: boolean } | null;
  // I watch over them, in this circle of theirs.
  asMyCompanion: { circle: string; isLead: boolean; isFirstCircle: boolean } | null;
  // Icon colors for each link (null = no such link) — see RelationIcons.
  sentinelColor: string | null;
  companionColor: string | null;
  avatarPath: string | null;
  paused?: boolean;
  subscribed?: boolean;
  publicStatus: string | null;
}

// /messages/:userId — the 1:1 conversation with one person. The header
// (who they are + any running alert about them or me) stays fixed while
// the messages scroll underneath.
export function ConversationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { userId = '' } = useParams();
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // listMessages() also marks this conversation's unread notifications read
  // server-side, so going back to the list shows it as read.
  const reloadMessages = async (convId: string) => {
    setMessages(await listMessages(convId));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listCircles(), listCompanions(), listAlerts()])
      .then(async ([circles, companions, myAlerts]) => {
        const rel = relationOf(circles, companions, userId);
        // They watch over me: an accepted link only.
        const mine = rel.sentinel?.membership.status === 'ACCEPTED' ? rel.sentinel : null;
        const sentinel = mine?.membership.linkAsSentinel ?? null;
        const asMySentinel: ContactInfo['asMySentinel'] = mine
          ? {
              circle: mine.circle.label,
              isLead: mine.membership.leadSlot !== null,
              isFirstCircle: mine.circle.circleType === 'FIRST',
            }
          : null;
        const comp = rel.companion;
        const asMyCompanion = comp
          ? { circle: comp.circle.label, isLead: comp.leadSlot !== null, isFirstCircle: comp.circle.isPrimary }
          : null;
        const firstName = comp?.companion.firstName ?? sentinel?.firstName;
        if (firstName) {
          setInfo({
            firstName,
            lastName: comp?.companion.lastName ?? sentinel?.lastName ?? null,
            userName: comp?.companion.userName ?? null,
            phone: comp?.companion.phone ?? sentinel?.phone ?? null,
            email: comp?.companion.email ?? null,
            asMySentinel,
            asMyCompanion,
            sentinelColor: rel.sentinelColor,
            companionColor: rel.companionColor,
            avatarPath: rel.avatarPath,
            paused: rel.paused,
            subscribed: rel.subscribed,
            publicStatus: rel.publicStatus,
          });
        } else {
          // Not in my circles: someone writing to the feedback inbox. Only
          // their first name is known, from the conversation list.
          const conv = (await listMyConversations()).find((c) => c.otherUserId === userId);
          if (conv) {
            setInfo({
              firstName: conv.otherFirstName,
              lastName: null,
              userName: null,
              phone: null,
              email: null,
              asMySentinel: null,
              asMyCompanion: null,
              sentinelColor: null,
              companionColor: null,
              avatarPath: null,
              publicStatus: null,
            });
          }
        }
        // Running alerts that concern this conversation: about them, or my own.
        setAlerts(
          myAlerts.filter(
            (a) => a.alertStatus !== 'RESOLVED' && (a.userCompanionId === userId || a.userCompanionId === user?.id),
          ),
        );
        return getDirectConversation(userId);
      })
      .then(async (conv) => {
        setConversationId(conv.id);
        await reloadMessages(conv.id);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useSocketEvent('message:new', (payload: { conversationId: string }) => {
    if (payload.conversationId === conversationId) void reloadMessages(conversationId);
  });

  // Newest message in view: the page opens at the bottom, and follows new
  // messages (sent or received).
  useEffect(() => {
    // Whole page to the very bottom: its bottom padding keeps the last
    // message above the fixed composer.
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages.length]);

  const name = info?.firstName ?? '';
  // Always just "Sentinel" in the sentence: which circle (Lead, 1st circle
  // or the circle's name) is the pill right after it (CircleChip).
  const roleLabel = (_r: { circle: string; isLead: boolean; isFirstCircle: boolean }) => t('conversation.roleCircle');

  return (
    <div className="page-bleed sticky-header-page conversation-page">
      <div className={`sticky-header conversation-header${info?.paused ? ' is-paused' : ''}`}>
        {/* No back link: the Messages icon of the bottom bar does that. */}
        {info && (
          // Photo + name open the person's page (contact details are there).
          <Link to={`/people/${userId}?from=messages`} className="conversation-contact">
            <PersonAvatar
              userId={userId}
              avatarPath={info.avatarPath}
              sentinelColor={info.sentinelColor}
              companionColor={info.companionColor}
              size={64}
              // The relations are spelled out right beside it: photo only.
              photoRing="#134356"
            />
            <div>
              <h1>
                {info.firstName} {info.lastName}
                {info.subscribed && <NameStar title={t('plans.star')} />}
              </h1>
              {/* One line per direction. No link at all only happens for
                  the feedback inbox's correspondents: no lines then. */}
              {(info.asMySentinel || info.asMyCompanion) && (
                <div className="conversation-relations">
                  {info.asMySentinel && (
                    <span className="conversation-rel" style={{ color: info.sentinelColor ?? undefined }}>
                      <SentinelIcon size={16} />
                      <span>{t('conversation.theyForMe', { name, role: roleLabel(info.asMySentinel) })}</span>
                      <CircleChip relation={info.asMySentinel} color={info.sentinelColor} />
                    </span>
                  )}
                  {info.asMyCompanion && (
                    <span className="conversation-rel">
                      <CompanionIcon size={17} color={info.companionColor ?? undefined} />
                      <span>{t('conversation.meForThem', { name, role: roleLabel(info.asMyCompanion) })}</span>
                      <CircleChip relation={info.asMyCompanion} color={info.companionColor} />
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        )}
        {/* Outside the link above (no link inside a link). */}
        {info && <CallButton phone={info.phone} name={info.firstName} compact className="conversation-call" />}
        {/* Their status under the photo, across the whole header. */}
        {info?.publicStatus && <p className="conversation-status">{info.publicStatus}</p>}
        {/* Only when there is one: no alert is the normal case. */}
        {!loading &&
          alerts.map((a) => (
              <div key={a.id} className="conversation-alert">
                <strong>
                  {a.userCompanionId === user?.id
                    ? t('conversation.myAlert', { label: a.label })
                    : t('conversation.alertAbout', { name, label: a.label })}
                </strong>
                {(a.statusByFirstCircle ?? a.statusByCompanion) && (
                  <span>{t('conversation.lastNews', { status: a.statusByFirstCircle ?? a.statusByCompanion })}</span>
                )}
                <Link to="/running-alert">{t('conversation.seeAlert')}</Link>
              </div>
          ))}
      </div>

      {loading ? (
        <Loading />
      ) : !conversationId ? (
        <p className="form-error">{error}</p>
      ) : (
        <>
          {messages.length === 0 ? (
            <p className="muted">{t('alerts.detail.noMessages')}</p>
          ) : (
            // Oldest at the top, newest at the bottom next to the composer.
            <MessageBubbles messages={messages} myId={user?.id} />
          )}
          {error && <p className="form-error">{error}</p>}
          {/* Fixed at the bottom of the screen (above the mobile bottom
              bar), like WhatsApp. */}
          <ChatComposer
            conversationId={conversationId}
            inputId="conversation-draft"
            onSent={() => reloadMessages(conversationId)}
            onError={setError}
          />
        </>
      )}
    </div>
  );
}
