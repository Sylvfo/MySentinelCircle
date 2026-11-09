// An alert's chats (1st-circle room, isolated chats with outer circles)
// stay writable for a while after the alert closes — time to thank, give
// news, organize the follow-up — then become read-only. Conversation.
// closedAt therefore means "writable until": set in the future by
// closeAlert, the conversation is closed once that moment has passed.
export const ALERT_CHAT_GRACE_DAYS = 7;

export function alertChatClosingDate(closedAt: Date): Date {
  return new Date(closedAt.getTime() + ALERT_CHAT_GRACE_DAYS * 86_400_000);
}

export function isConversationClosed(
  closedAt: Date | null,
  now: Date = new Date(),
): boolean {
  return closedAt !== null && closedAt <= now;
}
