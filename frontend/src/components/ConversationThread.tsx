import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errorText } from '../api/client';
import { listMessages, type Message } from '../api/messaging';
import { MessageBubbles } from './MessageBubbles';
import { ChatComposer } from './ChatComposer';
import { useSocketEvent } from '../realtime/useSocketEvent';

// One alert chat: its messages and the Messages composer. Hides itself
// entirely if the viewer turns out not to be a participant (e.g. a
// 1st-circle Sentinel excluded from their own circle's chat) rather than
// showing a bare error.
export function ConversationThread({
  conversationId,
  title,
  resolveSenderName,
  senderLink,
  fullPage = false,
  readOnly = false,
}: {
  conversationId: string;
  title?: string;
  resolveSenderName: (senderId: string) => string;
  senderLink?: (senderId: string) => string | null;
  // The alert's chat page: same layout as a Messages conversation — composer
  // (+ menu, paper plane) fixed at the bottom, page opening at the bottom.
  fullPage?: boolean;
  // A closed alert's chat after its 7 days: messages only, no composer.
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Full page: keep the newest message in view (above the fixed composer).
  useEffect(() => {
    if (fullPage && messages) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [fullPage, messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = async () => {
    try {
      setMessages(await listMessages(conversationId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(errorText(err));
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useSocketEvent('message:new', (payload: { conversationId: string }) => {
    if (payload.conversationId === conversationId) void reload();
  });

  if (loading || forbidden) return null;

  return (
    <div className={`alert-chat${fullPage ? '' : ' inline'}`}>
      {title && <h3>{title}</h3>}
      {messages && messages.length === 0 ? (
        <p className="muted">{t('alerts.detail.noMessages')}</p>
      ) : (
        <MessageBubbles messages={messages ?? []} myId={user?.id} nameOf={resolveSenderName} linkOf={senderLink} />
      )}
      {/* Same composer as in Messages (+ menu, emoji, paper plane); fixed at
          the bottom on the chat page only, inline anywhere else. */}
      {readOnly ? (
        <p className="chat-closed-note">{t('messages.alertChatReadOnly')}</p>
      ) : (
        <ChatComposer
          conversationId={conversationId}
          inputId={`thread-draft-${conversationId}`}
          onSent={reload}
          onError={setError}
        />
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
