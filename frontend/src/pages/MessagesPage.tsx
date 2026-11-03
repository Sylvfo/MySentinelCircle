import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import { listMyConversations, type ConversationSummary } from '../api/messaging';

type RosterContact = Omit<Contact, 'lastMessage' | 'unreadCount'>;

interface Contact {
  userId: string;
  name: string;
  lastMessage: ConversationSummary['lastMessage'];
  unreadCount: number;
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { socket } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    return listMyConversations()
      .then(applyConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  };

  const loadAll = () => {
    return Promise.all([listCircles(), listCompanions()])
      .then(([circles, companions]) => {
        // My own accepted Sentinels (any circle) — Sentinel SMS has no
        // account, so there's no in-app channel to open with them.
        const mySentinels: RosterContact[] = circles.flatMap((c) =>
          c.userSentinels
            .filter((m) => m.status === 'ACCEPTED' && m.sentinelType !== 'ONLY_SMS')
            .map((m) => ({ userId: m.linkAsSentinel.id, name: m.linkAsSentinel.firstName })),
        );
        // People I'm a Sentinel for — the reverse direction.
        const myCompanions: RosterContact[] = companions.map((c) => ({
          userId: c.companion.id,
          name: c.companion.firstName,
        }));
        // A mutual relationship (I'm their Sentinel and they're mine) would
        // otherwise list the same person — and the same underlying direct
        // conversation — twice; keep one entry.
        const byUserId = new Map<string, RosterContact>();
        for (const c of [...mySentinels, ...myCompanions]) {
          if (!byUserId.has(c.userId)) byUserId.set(c.userId, c);
        }
        rosterRef.current = [...byUserId.values()];
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

  return (
    <div>
      <h1>{t('messages.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('messages.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {contacts.length === 0 ? (
        <div className="empty-state">{t('messages.empty')}</div>
      ) : (
        <section className="panel conversation-list">
          {/* Most recent first (see applyConversations); unread ones in bold. */}
          {contacts.map((c) => (
            <button
              key={c.userId}
              className={`conversation-row${c.unreadCount > 0 ? ' unread' : ''}`}
              onClick={() => navigate(`/messages/${c.userId}`)}
            >
              <span className="conversation-name">
                {c.name}
                {c.unreadCount > 0 && <span className="notification-count inline">{c.unreadCount}</span>}
              </span>
              <span className="conversation-preview">
                {!c.lastMessage
                  ? t('messages.noMessageYet')
                  : c.lastMessage.type === 'IMAGE'
                    ? t('messages.photo')
                    : c.lastMessage.body}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
