import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError, API_URL } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import {
  getDirectConversation,
  listMessages,
  listMyConversations,
  sendImageMessage,
  sendMessage,
  type Message,
} from '../api/messaging';

type RosterContact = Omit<Contact, 'lastMessageAt' | 'unreadCount'>;

interface Contact {
  userId: string;
  name: string;
  context: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { socket } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);

  // Who I can message at all barely ever changes — only the conversation
  // summaries below do, on every new message. Keeping the two apart means a
  // live message:new only costs one GET, not three: this app's rate limit
  // (20 req/60s) is shared across the whole app, so refetching the roster
  // on every message adds up fast (see the same lesson already learned on
  // AlertDetailPanel).
  const rosterRef = useRef<RosterContact[]>([]);
  const convMapRef = useRef<Map<string, string>>(new Map());
  const selectedRef = useRef<Contact | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const applyConversations = (conversations: Awaited<ReturnType<typeof listMyConversations>>) => {
    const convByUser = new Map(conversations.map((c) => [c.otherUserId, c]));
    convMapRef.current = new Map(conversations.map((c) => [c.otherUserId, c.conversationId]));
    const enriched: Contact[] = rosterRef.current.map((c) => {
      const conv = convByUser.get(c.userId);
      return {
        ...c,
        lastMessageAt: conv?.lastMessage?.createdAt ?? null,
        unreadCount: conv?.unreadCount ?? 0,
      };
    });
    // Most recently active first; contacts never messaged yet stay at
    // the end, in their original order (stable sort).
    enriched.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
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
            .map((m) => ({ userId: m.linkAsSentinel.id, name: m.linkAsSentinel.firstName, context: c.label })),
        );
        // People I'm a Sentinel for — the reverse direction.
        const myCompanions: RosterContact[] = companions.map((c) => ({
          userId: c.companion.id,
          name: c.companion.email ?? c.companion.phone ?? '…',
          context: t('messages.companionContext'),
        }));
        // A mutual relationship (I'm their Sentinel and they're mine) would
        // otherwise list the same person — and the same underlying direct
        // conversation — twice; merge into one entry, both contexts shown.
        const byUserId = new Map<string, RosterContact>();
        for (const c of [...mySentinels, ...myCompanions]) {
          const existing = byUserId.get(c.userId);
          byUserId.set(c.userId, existing ? { ...existing, context: `${existing.context} · ${c.context}` } : c);
        }
        rosterRef.current = [...byUserId.values()];
        return refreshConversations();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      // The open conversation's own ChatPanel already refreshes this list
      // (via onRead) when it reacts to the very same event — don't also
      // reload here, that would just double the request count for nothing.
      const openConvId = selectedRef.current && convMapRef.current.get(selectedRef.current.userId);
      if (openConvId === payload.conversationId) return;
      refreshConversations();
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  return (
    <div>
      <h1>{t('messages.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('messages.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {contacts.length === 0 ? (
        <div className="empty-state">{t('messages.empty')}</div>
      ) : (
        <section className="panel">
          {contacts.map((c) => (
            <div key={c.userId} className="row">
              <span>
                {c.name} <span style={{ color: 'var(--text-muted)' }}>— {c.context}</span>
                {c.unreadCount > 0 && <span className="notification-count inline">{c.unreadCount}</span>}
              </span>
              <button className="ghost" onClick={() => setSelected(c)}>
                {t('messages.open')}
              </button>
            </div>
          ))}
        </section>
      )}

      {selected && (
        <ChatPanel contact={selected} onClose={() => setSelected(null)} onRead={refreshConversations} />
      )}
    </div>
  );
}

function ChatPanel({
  contact,
  onClose,
  onRead,
}: {
  contact: Contact;
  onClose: () => void;
  onRead: () => void;
}) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // listMessages() marks this conversation's unread NEW_MESSAGE
  // notifications read server-side — refresh the outer contact list so
  // its badge/recency sort stays in sync with what was just viewed.
  const reloadMessages = async (convId: string) => {
    setMessages(await listMessages(convId));
    onRead();
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDirectConversation(contact.userId)
      .then(async (conv) => {
        setConversationId(conv.id);
        await reloadMessages(conv.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.userId]);

  useEffect(() => {
    if (!socket || !conversationId) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        reloadMessages(conversationId);
      }
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

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

  return (
    <section className="panel alert-detail">
      <div className="row">
        <h3>{contact.name}</h3>
        <button className="ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
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
            <ul className="alert-chat-messages">
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.senderId === user?.id ? t('alerts.detail.me') : contact.name}</strong> :{' '}
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
        </>
      )}
    </section>
  );
}
