import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../api/client';
import { MessageBubbles } from '../components/MessageBubbles';
import { AttachMenu } from '../components/ChatComposer';
import { NOTIFICATIONS_CHANGED } from '../api/notification';
import {
  getSupportConversation,
  listMessages,
  sendImageMessage,
  sendMessage,
  type Message,
} from '../api/messaging';
import { useSocketEvent } from '../realtime/useSocketEvent';
import { Loading } from '../components/Loading';
import { useAction } from '../useAction';

// Give feedback: the user's own thread with the team — an ordinary direct
// conversation with the feedback inbox account (backend SupportService),
// shown here only, never in Messages. Quick choices prefix the message so
// the team sees at a glance what it's about; replies show up below, newest
// first, and are flagged on the About tab until read.
const KINDS = ['love', 'story', 'bug', 'confusing', 'dislike', 'idea'] as const;
type Kind = (typeof KINDS)[number];

export function FeedbackPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [kind, setKind] = useState<Kind | null>(null);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const { busy: sending, error, setError, run } = useAction();
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
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
    // setError never changes (a state setter, through useAction).
  }, [setError]);

  useSocketEvent('message:new', (payload: { conversationId: string }) => {
    if (payload.conversationId === conversationId) void reload(conversationId);
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!conversationId || !draft.trim()) return;
    void run(async () => {
      const prefix = kind ? `${t(`feedback.kinds.${kind}`)} : ` : '';
      await sendMessage(conversationId, prefix + draft.trim());
      setDraft('');
      setKind(null);
      setSent(true);
      await reload(conversationId);
    });
  };

  // A screenshot or photo, sent as its own message (same as in Messages).
  const submitImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!conversationId || !file) return;
    void run(async () => {
      await sendImageMessage(conversationId, file);
      setSent(true);
      await reload(conversationId);
    });
  };

  return (
    <div className="feedback-page">
      <Link to="/info">{t('feedback.back')}</Link>
      <h1>{t('feedback.title')}</h1>
      <p className="form-hint">{t('feedback.intro')}</p>

      {loading ? (
        <Loading />
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
              id="feedback-message" maxLength={1900}
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
              <AttachMenu disabled={sending} onPickPhoto={() => fileInputRef.current?.click()} />
              {/* Small hint next to the "+": a screenshot often says more. */}
              <button
                type="button"
                className="feedback-attach-hint"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('feedback.attachHint')}
              </button>
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
