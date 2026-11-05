import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import { listAlerts, type MyAlertSummary } from '../api/alert';
import { NOTIFICATIONS_CHANGED } from '../api/notification';
import {
  getDirectConversation,
  listMessages,
  listMyConversations,
  sendImageMessage,
  sendMessage,
  type Message,
} from '../api/messaging';
import { PersonAvatar } from '../components/PersonAvatar';
import { CircleChip } from '../components/CircleChip';
import { SentinelIcon } from '../components/SentinelIcon';
import { CompanionIcon } from '../components/CompanionIcon';
import { MessageBubbles } from '../components/MessageBubbles';
import { EmojiButton } from '../components/EmojiButton';
import { avatarPathOf, myCompanionColor, mySentinelColor, publicStatusOf } from '../relations';

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
  publicStatus: string | null;
}

// /messages/:userId — the 1:1 conversation with one person. The header
// (who they are + any running alert about them or me) stays fixed while
// the messages scroll underneath.
export function ConversationPage() {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const { userId = '' } = useParams();
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);

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
        let sentinel: { firstName: string; lastName?: string | null; phone: string } | null = null;
        let asMySentinel: ContactInfo['asMySentinel'] = null;
        for (const c of circles) {
          const m = c.userSentinels.find((s) => s.linkAsSentinel.id === userId && s.status === 'ACCEPTED');
          if (m) {
            sentinel = m.linkAsSentinel;
            asMySentinel = { circle: c.label, isLead: m.leadSlot !== null, isFirstCircle: c.circleType === 'FIRST' };
          }
        }
        const comp = companions.find((c) => c.companion.id === userId);
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
            sentinelColor: mySentinelColor(circles, userId),
            companionColor: myCompanionColor(companions, userId),
            avatarPath: avatarPathOf(circles, companions, userId),
            publicStatus: publicStatusOf(circles, companions, userId),
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
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!socket || !conversationId) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) void reloadMessages(conversationId);
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  // Newest message in view: the page opens at the bottom, and follows new
  // messages (sent or received).
  useEffect(() => {
    // Whole page to the very bottom: its bottom padding keeps the last
    // message above the fixed composer.
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(conversationId, draft.trim());
      setDraft('');
      await reloadMessages(conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const submitImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!conversationId || !file) return;
    setSending(true);
    try {
      await sendImageMessage(conversationId, file);
      await reloadMessages(conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const name = info?.firstName ?? '';
  // Always just "Sentinel" in the sentence: which circle (Lead, 1st circle
  // or the circle's name) is the pill right after it (CircleChip).
  const roleLabel = (_r: { circle: string; isLead: boolean; isFirstCircle: boolean }) => t('conversation.roleCircle');

  return (
    <div className="page-bleed sticky-header-page conversation-page">
      <div className="sticky-header conversation-header">
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
        <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>
      ) : !conversationId ? (
        <p className="form-error">{error}</p>
      ) : (
        <>
          {messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
          ) : (
            // Oldest at the top, newest at the bottom next to the composer.
            <MessageBubbles messages={messages} myId={user?.id} />
          )}
          {error && <p className="form-error">{error}</p>}
          {/* Messaging-app composer, fixed at the bottom of the screen
              (above the mobile bottom bar), like WhatsApp: "+" menu (photo
              now, GPS position later), text field, paper-plane send. */}
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
              id="conversation-draft"
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              disabled={sending}
              onChange={submitImage}
            />
          </form>
        </>
      )}
    </div>
  );
}
