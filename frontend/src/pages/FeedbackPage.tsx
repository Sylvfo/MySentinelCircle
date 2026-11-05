import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { MessageBubbles } from '../components/MessageBubbles';
import { NOTIFICATIONS_CHANGED } from '../api/notification';
import {
  getSupportConversation,
  listMessages,
  sendImageMessage,
  sendMessage,
  type Message,
} from '../api/messaging';

// Give feedback: the user's own thread with the team — an ordinary direct
// conversation with the feedback inbox account (backend SupportService),
// shown here only, never in Messages. Quick choices prefix the message so
// the team sees at a glance what it's about; replies show up below, newest
// first, and are flagged on the About tab until read.
const KINDS = ['love', 'story', 'bug', 'confusing', 'dislike', 'idea'] as const;
type Kind = (typeof KINDS)[number];

export function FeedbackPage() {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [kind, setKind] = useState<Kind | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // listMessages() also marks the team's replies read (About badge clears).
  const reload = async (convId: string) => {
    setMessages(await listMessages(convId));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  };

  useEffect(() => {
    getSupportConversation()
      .then(async (conv) => {
        setConversationId(conv.id);
        await reload(conv.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket || !conversationId) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) void reload(conversationId);
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
    setError(null);
    try {
      const prefix = kind ? `${t(`feedback.kinds.${kind}`)} : ` : '';
      await sendMessage(conversationId, prefix + draft.trim());
      setDraft('');
      setKind(null);
      setSent(true);
      await reload(conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  // A screenshot or photo, sent as its own message (same as in Messages).
  const submitImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!conversationId || !file) return;
    setSending(true);
    setError(null);
    try {
      await sendImageMessage(conversationId, file);
      setSent(true);
      await reload(conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="feedback-page">
      <Link to="/info">{t('feedback.back')}</Link>
      <h1>{t('feedback.title')}</h1>
      <p className="form-hint">{t('feedback.intro')}</p>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>
      ) : !conversationId ? (
        <p className="form-error">{error ?? t('feedback.unavailable')}</p>
      ) : (
        <>
          <form className="feedback-form" autoComplete="off" onSubmit={submit}>
            <div className="feedback-kinds" role="radiogroup" aria-label={t('feedback.kindLabel')}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={`feedback-kind${kind === k ? ' selected' : ''}`}
                  onClick={() => setKind(kind === k ? null : k)}
                >
                  {t(`feedback.kinds.${k}`)}
                </button>
              ))}
            </div>
            <textarea
              id="feedback-message"
              rows={4}
              placeholder={t('feedback.placeholder')}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSent(false);
              }}
            />
            <div className="feedback-actions">
              {/* "+" menu, as in a conversation: a photo now, more later. */}
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
              <input ref={fileInputRef} type="file" accept="image/*" hidden disabled={sending} onChange={submitImage} />
              <span className="feedback-spacer" />
              {sent && <span className="feedback-thanks">{t('feedback.thanks')}</span>}
              <button type="submit" disabled={sending || !draft.trim()}>
                {t('feedback.send')}
              </button>
            </div>
          </form>
          {error && <p className="form-error">{error}</p>}

          {messages.length > 0 && (
            <>
              <h2 className="messages-section-title">{t('feedback.history')}</h2>
              <MessageBubbles messages={messages} myId={user?.id} nameOf={() => t('feedback.team')} />
            </>
          )}
        </>
      )}
    </div>
  );
}
