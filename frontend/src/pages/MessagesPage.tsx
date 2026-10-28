import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError, API_URL } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import { getDirectConversation, listMessages, sendImageMessage, sendMessage, type Message } from '../api/messaging';

interface Contact {
  userId: string;
  name: string;
  context: string;
}

export function MessagesPage() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);

  useEffect(() => {
    Promise.all([listCircles(), listCompanions()])
      .then(([circles, companions]) => {
        // My own accepted Sentinels (any circle) — Sentinel SMS has no
        // account, so there's no in-app channel to open with them.
        const mySentinels: Contact[] = circles.flatMap((c) =>
          c.userSentinels
            .filter((m) => m.status === 'ACCEPTED' && m.sentinelType !== 'ONLY_SMS')
            .map((m) => ({ userId: m.linkAsSentinel.id, name: m.linkAsSentinel.firstName, context: c.label })),
        );
        // People I'm a Sentinel for — the reverse direction.
        const myCompanions: Contact[] = companions.map((c) => ({
          userId: c.companion.id,
          name: c.companion.email ?? c.companion.phone ?? '…',
          context: t('messages.companionContext'),
        }));
        // A mutual relationship (I'm their Sentinel and they're mine) would
        // otherwise list the same person — and the same underlying direct
        // conversation — twice; merge into one entry, both contexts shown.
        const byUserId = new Map<string, Contact>();
        for (const c of [...mySentinels, ...myCompanions]) {
          const existing = byUserId.get(c.userId);
          byUserId.set(c.userId, existing ? { ...existing, context: `${existing.context} · ${c.context}` } : c);
        }
        setContacts([...byUserId.values()]);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              </span>
              <button className="ghost" onClick={() => setSelected(c)}>
                {t('messages.open')}
              </button>
            </div>
          ))}
        </section>
      )}

      {selected && <ChatPanel contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ChatPanel({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const reloadMessages = async (convId: string) => {
    setMessages(await listMessages(convId));
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
