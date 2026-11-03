import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError, API_URL } from '../api/client';
import { listCircles, listCompanions } from '../api/sentinel';
import { listAlerts, type MyAlertSummary } from '../api/alert';
import { NOTIFICATIONS_CHANGED } from '../api/notification';
import { getDirectConversation, listMessages, sendImageMessage, sendMessage, type Message } from '../api/messaging';
import { CompanionIcon } from '../components/CompanionIcon';
import { companionColor } from '../theme';

// Everything known about the other person, from both directions of the
// relationship: they can be my Sentinel, someone I watch over, or both.
interface ContactInfo {
  firstName: string;
  lastName: string | null;
  userName: string | null;
  phone: string | null;
  email: string | null;
  // They watch over me, in this circle of mine.
  asMySentinel: { circle: string; isLead: boolean } | null;
  // I watch over them, in this circle of theirs.
  asMyCompanion: { circle: string; isLead: boolean } | null;
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
      .then(([circles, companions, myAlerts]) => {
        let sentinel: { firstName: string; lastName?: string | null; phone: string } | null = null;
        let asMySentinel: ContactInfo['asMySentinel'] = null;
        for (const c of circles) {
          const m = c.userSentinels.find((s) => s.linkAsSentinel.id === userId && s.status === 'ACCEPTED');
          if (m) {
            sentinel = m.linkAsSentinel;
            asMySentinel = { circle: c.label, isLead: m.leadSlot !== null };
          }
        }
        const comp = companions.find((c) => c.companion.id === userId);
        const asMyCompanion = comp ? { circle: comp.circle.label, isLead: comp.leadSlot !== null } : null;
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
          });
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

  // Newest message in view, like any chat.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
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

  return (
    <div className="page-bleed sticky-header-page conversation-page">
      <div className="sticky-header conversation-header">
        <Link to="/messages">{t('conversation.back')}</Link>
        {info && (
          <div className="conversation-contact">
            <CompanionIcon size={56} color={companionColor(userId)} />
            <div>
              <h1>
                {info.firstName} {info.lastName}
              </h1>
              <div className="conversation-contact-details">
                {info.userName && <span>@{info.userName}</span>}
                {info.phone && <span>{info.phone}</span>}
                {info.email && <span>{info.email}</span>}
              </div>
              <div>
                {info.asMySentinel && (
                  <span className="badge">
                    {t(info.asMySentinel.isLead ? 'conversation.myLeadSentinel' : 'conversation.mySentinel', {
                      circle: info.asMySentinel.circle,
                    })}
                  </span>
                )}
                {info.asMyCompanion && (
                  <span className="badge">
                    {t(info.asMyCompanion.isLead ? 'conversation.iAmLead' : 'conversation.iWatch', {
                      name,
                      circle: info.asMyCompanion.circle,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {!loading &&
          (alerts.length === 0 ? (
            <p className="conversation-alert-none">{t('conversation.noAlert')}</p>
          ) : (
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
            ))
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
            <ul className="alert-chat-messages">
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.senderId === user?.id ? t('alerts.detail.me') : name}</strong> :{' '}
                  {m.type === 'IMAGE' ? (
                    <img
                      src={`${API_URL}/uploads/messages/${m.body}`}
                      alt=""
                      style={{ maxWidth: 200, borderRadius: 8, display: 'block' }}
                    />
                  ) : (
                    m.body
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="row conversation-compose" onSubmit={submit}>
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
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}
