import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import {
  isChatClosed,
  listMyAlertChats,
  listMyConversations,
  type AlertChatSummary,
  type ConversationSummary,
} from '../api/messaging';
import { PersonAvatar } from '../components/PersonAvatar';
import { alertChatKind, alertChatTitle } from '../alertChatName';
import { avatarPathOf, isPausedOf, isSubscribedOf, myCompanionColor, mySentinelColor } from '../relations';

type RosterContact = Omit<Contact, 'lastMessage' | 'unreadCount'>;

interface Contact {
  userId: string;
  name: string;
  // Who they are to me (null = no such link) — see RelationIcons.
  sentinelColor: string | null;
  companionColor: string | null;
  avatarPath: string | null;
  paused?: boolean;
  subscribed?: boolean;
  lastMessage: ConversationSummary['lastMessage'];
  unreadCount: number;
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { socket, user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alertChats, setAlertChats] = useState<AlertChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Who I can message at all barely ever changes — only the conversation
  // summaries below do, on every new message. Keeping the two apart means a
  // live message:new only costs one GET, not three: this app's rate limit
  // (20 req/60s) is shared across the whole app, so refetching the roster
  // on every message adds up fast (see the same lesson already learned on
  // AlertDetailPanel).
  const rosterRef = useRef<RosterContact[]>([]);

  const applyConversations = (conversations: Awaited<ReturnType<typeof listMyConversations>>) => {
    const convByUser = new Map(conversations.map((c) => [c.otherUserId, c]));
    const enriched: Contact[] = rosterRef.current.map((c) => {
      const conv = convByUser.get(c.userId);
      return {
        ...c,
        lastMessage: conv?.lastMessage ?? null,
        unreadCount: conv?.unreadCount ?? 0,
      };
    });
    // Conversations with people outside my circles — in practice only the
    // feedback inbox account's, whose Messages hold everyone's feedback.
    const inRoster = new Set(rosterRef.current.map((c) => c.userId));
    for (const conv of conversations) {
      if (inRoster.has(conv.otherUserId)) continue;
      enriched.push({
        userId: conv.otherUserId,
        name: conv.otherFirstName,
        sentinelColor: null,
        companionColor: null,
        avatarPath: null,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount,
      });
    }
    // Most recently active first; contacts never messaged yet stay at
    // the end, in their original order (stable sort).
    enriched.sort((a, b) => {
      if (a.lastMessage && b.lastMessage) return b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt);
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return 0;
    });
    setContacts(enriched);
  };

  const refreshConversations = () => {
    return Promise.all([listMyConversations(), listMyAlertChats()])
      .then(([conversations, chats]) => {
        applyConversations(conversations);
        setAlertChats(chats);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  };

  const loadAll = () => {
    return Promise.all([listCircles(), listCompanions()])
      .then(([circles, companions]) => {
        // My own accepted Sentinels (any circle) — Sentinel SMS has no
        // account, so there's no in-app channel to open with them.
        const mySentinels: Pick<RosterContact, 'userId' | 'name'>[] = circles.flatMap((c) =>
          c.userSentinels
            .filter((m) => m.status === 'ACCEPTED' && m.sentinelType !== 'ONLY_SMS')
            .map((m) => ({ userId: m.linkAsSentinel.id, name: m.linkAsSentinel.firstName })),
        );
        // People I'm a Sentinel for — the reverse direction.
        const myCompanions: Pick<RosterContact, 'userId' | 'name'>[] = companions.map((c) => ({
          userId: c.companion.id,
          name: c.companion.firstName,
        }));
        // A mutual relationship (I'm their Sentinel and they're mine) would
        // otherwise list the same person — and the same underlying direct
        // conversation — twice; keep one entry.
        const byUserId = new Map<string, Pick<RosterContact, 'userId' | 'name'>>();
        for (const c of [...mySentinels, ...myCompanions]) {
          if (!byUserId.has(c.userId)) byUserId.set(c.userId, c);
        }
        rosterRef.current = [...byUserId.values()].map((c) => ({
          ...c,
          sentinelColor: mySentinelColor(circles, c.userId),
          companionColor: myCompanionColor(companions, c.userId),
          avatarPath: avatarPathOf(circles, companions, c.userId),
          paused: isPausedOf(circles, companions, c.userId),
          subscribed: isSubscribedOf(circles, companions, c.userId),
        }));
        return refreshConversations();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = () => {
      void refreshConversations();
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Old /messages?with=<userId> links: the conversation has its own page now.
  const withUserId = searchParams.get('with');
  if (withUserId) return <Navigate to={`/messages/${withUserId}`} replace />;

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  // Only real conversations are listed; everyone else in my roster is reached
  // through the search box ("New message"), so the list never fills up with
  // people I've never written to.
  const q = query.trim().toLocaleLowerCase();
  const matches = (c: Contact) => !q || c.name.toLocaleLowerCase().includes(q);
  const conversations = contacts.filter((c) => c.lastMessage && matches(c));
  const newContacts = q ? contacts.filter((c) => !c.lastMessage && matches(c)) : [];
  // Alert chats (running alerts first, then closed ones, read-only after
  // their 7 days). Search matches the person concerned or the alert's name.
  const concerns = (c: AlertChatSummary) =>
    c.companion.id === user?.id ? t('history.concernsMe') : c.companion.firstName;
  const shownAlertChats = alertChats.filter(
    (c) => !q || concerns(c).toLocaleLowerCase().includes(q) || c.alertLabel.toLocaleLowerCase().includes(q),
  );


  return (
    <div>
      <h1>{t('messages.title')}</h1>
      {/* Search right under the title: it covers both sections below. */}
      <input
        id="messages-search"
        autoComplete="off"
        type="search"
        className="messages-search"
        placeholder={t('messages.searchPlaceholder')}
        aria-label={t('messages.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="form-error">{error}</p>}

      {/* Above everything else: an alert's chats matter more than everyday
          conversations. Closed alerts stay listed, read-only after 7 days. */}
      {shownAlertChats.length > 0 && (
        <>
          <h2 className="messages-section-title">{t('messages.sections.alerts')}</h2>
          <section className="panel conversation-list">
            {shownAlertChats.map((c) => (
              <button
                key={c.conversationId}
                className={`conversation-row alert-chat-row${c.unreadCount > 0 ? ' unread' : ''}${
                  c.alertStatus === 'RESOLVED' ? ' resolved' : ''
                }`}
                onClick={() => navigate(`/messages/alert/${c.conversationId}`)}
              >
                <span className="alert-chat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M12 3 L22 20 H2 Z" />
                    <line x1="12" y1="10" x2="12" y2="14" strokeLinecap="round" />
                    <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="conversation-text">
                  <span className="conversation-name">
                    {alertChatTitle(t, c, user?.id)}
                    {c.unreadCount > 0 && <span className="notification-count inline">{c.unreadCount}</span>}
                  </span>
                  <span className="conversation-preview">
                    {alertChatKind(t, c, user?.id)}
                    {c.alertStatus === 'RESOLVED' && (
                      <>
                        {' '}
                        <span className="badge">
                          {t(isChatClosed(c) ? 'messages.alertChatClosed' : 'messages.alertResolved')}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </section>
        </>
      )}

      {/* Everyday chats with my Sentinels and the people I watch over. */}
      {shownAlertChats.length > 0 && <h2 className="messages-section-title">{t('messages.sections.contacts')}</h2>}
      {conversations.length > 0 && (
        <section className="panel conversation-list">
          {/* Most recent first (see applyConversations); unread ones in bold. */}
          {conversations.map((c) => (
            <button
              key={c.userId}
              className={`conversation-row${c.unreadCount > 0 ? ' unread' : ''}`}
              onClick={() => navigate(`/messages/${c.userId}`)}
            >
              <PersonAvatar
                userId={c.userId}
                avatarPath={c.avatarPath}
                paused={c.paused}
                subscribed={c.subscribed}
                sentinelColor={c.sentinelColor}
                companionColor={c.companionColor}
              />
              <span className="conversation-text">
                <span className="conversation-name">
                  {c.name}
                  {c.unreadCount > 0 && <span className="notification-count inline">{c.unreadCount}</span>}
                </span>
                <span className="conversation-preview">
                  {c.lastMessage?.type === 'IMAGE' ? t('messages.photo') : c.lastMessage?.body}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}

      {newContacts.length > 0 && (
        <section className="panel conversation-list">
          <h2 className="conversation-list-title">{t('messages.newMessage')}</h2>
          {newContacts.map((c) => (
            <button key={c.userId} className="conversation-row" onClick={() => navigate(`/messages/${c.userId}`)}>
              <PersonAvatar
                userId={c.userId}
                avatarPath={c.avatarPath}
                paused={c.paused}
                subscribed={c.subscribed}
                sentinelColor={c.sentinelColor}
                companionColor={c.companionColor}
              />
              <span className="conversation-text">
                <span className="conversation-name">{c.name}</span>
                <span className="conversation-preview">{t('messages.startConversation')}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {conversations.length === 0 && newContacts.length === 0 && (
        <div className="empty-state">
          {q ? t('messages.noMatch') : contacts.length === 0 ? t('messages.empty') : t('messages.noConversationYet')}
        </div>
      )}

    </div>
  );
}
