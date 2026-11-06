import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isChatClosed, listMyAlertChats, type AlertChatSummary } from '../api/messaging';
import { AlertDetailPanel, ConversationThread } from './AlertsPage';
import { alertChatKind, alertChatTitle } from '../alertChatName';

// /messages/alert/:conversationId — an alert's chat, in Messages:
// - the 1st-circle room: with the room's tools above it (responsible Lead,
//   person found, the alert's name and statuses, the 1st circle);
// - an isolated chat between an outer-circle Sentinel and the 1st circle.
// After the alert closes it stays writable 7 days, then read-only.
export function AlertChatPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { conversationId = '' } = useParams();
  const [chat, setChat] = useState<AlertChatSummary | null | undefined>(undefined);

  useEffect(() => {
    listMyAlertChats()
      .then((chats) => setChat(chats.find((c) => c.conversationId === conversationId) ?? null))
      .catch(() => setChat(null));
  }, [conversationId]);

  if (chat === undefined) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;
  if (chat === null) return <Navigate to="/messages" replace />;

  const resolved = chat.alertStatus === 'RESOLVED';
  const closed = isChatClosed(chat);
  // I'm the outer-circle Sentinel of this chat: the 1st circle stays anonymous.
  const iAmOutsider = chat.outsider?.id === user?.id;
  const nameOf = (id: string) =>
    id === user?.id
      ? t('alerts.detail.me')
      : (chat.senders.find((s) => s.id === id)?.firstName ?? t('alerts.detail.circleChat.firstCircleSender'));
  const until = chat.closedAt
    ? new Date(chat.closedAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })
    : '';

  return (
    <div className="conversation-page alert-chat-page">
      <div className="alert-chat-head">
        <h1>{alertChatTitle(t, chat, user?.id)}</h1>
        <p className="alert-chat-kind">{alertChatKind(t, chat, user?.id)}</p>
        <p className="running-alert-meta">
          {chat.alertLabel} ·{' '}
          <Link to={resolved ? `/history/${chat.alertId}` : `/running-alert/${chat.alertId}`}>
            {t('messages.openAlert')}
          </Link>
        </p>
        {resolved && (
          <p className="chat-closed-note">
            {closed ? t('messages.alertChatReadOnly') : t('messages.alertChatOpenUntil', { date: until })}
          </p>
        )}
      </div>
      {chat.kind === 'room' ? (
        // The room's tools + this one conversation (AlertDetailPanel's chat
        // view, as on the old /running-alert/:id/chat page).
        <AlertDetailPanel alertId={chat.alertId} view="chat" conversationId={chat.conversationId} />
      ) : (
        <ConversationThread
          conversationId={chat.conversationId}
          resolveSenderName={nameOf}
          // The person page can show the others only to the alert's team.
          senderLink={iAmOutsider ? undefined : (id) => (id === user?.id ? null : `/people/${id}?alert=${chat.alertId}`)}
          fullPage
          readOnly={closed}
        />
      )}
    </div>
  );
}

// /running-alert/:alertId/chat (old links, buttons on the alert page): the
// alert's room in Messages — or, for an outer-circle Sentinel, their own
// chat with the 1st circle.
export function AlertChatRedirect() {
  const { alertId = '' } = useParams();
  const [target, setTarget] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    listMyAlertChats()
      .then((chats) => {
        const mine = chats.filter((c) => c.alertId === alertId);
        const chat = mine.find((c) => c.kind === 'room') ?? mine[0];
        setTarget(chat ? `/messages/alert/${chat.conversationId}` : `/running-alert/${alertId}`);
      })
      .catch(() => setTarget(`/running-alert/${alertId}`));
  }, [alertId]);

  if (target === undefined) return null;
  return <Navigate to={target!} replace />;
}
