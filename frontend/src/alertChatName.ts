import type { TFunction } from 'i18next';
import type { AlertChatSummary } from './api/messaging';

// How an alert chat is named, in Messages and on its page:
// line 1 "Alert Chloé · Missing person", line 2 which chat
// ("1st circle chat", "1st circle chat with Camille", or — for Camille —
// "Chat with the 1st circle").
export function alertChatTitle(t: TFunction, c: AlertChatSummary, myId: string | undefined): string {
  const who = c.companion.id === myId ? t('history.concernsMe') : c.companion.firstName;
  return t('messages.alertChatTitle', { who, type: t(`alerts.type.${c.alertType}`) });
}

export function alertChatKind(t: TFunction, c: AlertChatSummary, myId: string | undefined): string {
  if (c.kind === 'room') return t('messages.chatFirstCircle');
  return c.outsider && c.outsider.id !== myId
    ? t('messages.chatFirstCircleWith', { name: c.outsider.firstName })
    : t('messages.chatWithFirstCircle');
}
