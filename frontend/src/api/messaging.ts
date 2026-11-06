import type { Gender } from '../gender';
import { API_URL, ApiError, apiGet, apiPost, apiPostForm, getToken } from './client';

export type MessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export interface Message {
  id: string;
  body: string;
  type: MessageType;
  senderId: string;
  conversationId: string;
  createdAt: string;
}

export const sendMessage = (conversationId: string, body: string) =>
  apiPost<Message>(`/messaging/conversations/${conversationId}/messages`, { body });

// An IMAGE message's body is the stored file name; the picture itself is
// private (participants only) — show it with useMessageImageUrl.
export const sendImageMessage = (conversationId: string, file: File) => {
  const formData = new FormData();
  formData.append('image', file);
  return apiPostForm<Message>(`/messaging/conversations/${conversationId}/messages/image`, formData);
};

export const listMessages = (conversationId: string) =>
  apiGet<Message[]>(`/messaging/conversations/${conversationId}/messages`);

export interface DirectConversation {
  id: string;
  closedAt: string | null;
}

// The permanent Me<->Sentinel channel — finds or lazily creates the 1:1
// conversation with userId. Rejects (403) unless the two have an accepted
// Sentinel link (in either direction).
export const getDirectConversation = (userId: string) =>
  apiGet<DirectConversation>(`/messaging/direct/${userId}`);

// My own feedback thread with the team (Give feedback page) — kept out of
// Messages, see SupportService in the backend.
export const getSupportConversation = () => apiGet<DirectConversation>('/messaging/support');

export interface ConversationSummary {
  conversationId: string;
  otherUserId: string;
  // To name people outside my circles (the feedback inbox's own list).
  otherFirstName: string;
  // How texts speak about them; null = inclusive wording.
  otherGender?: Gender | null;
  lastMessage: { body: string; type: MessageType; createdAt: string } | null;
  unreadCount: number;
}

// Every direct conversation I'm in, with the other side, the latest
// message, and my unread count — what MessagesPage sorts/badges contacts by.
export const listMyConversations = () => apiGet<ConversationSummary[]>('/messaging/mine');

// One chat of an alert I take part in: the 1st-circle room, or an isolated
// chat between an outer-circle Sentinel and the 1st circle.
export interface AlertChatSummary {
  conversationId: string;
  alertId: string;
  alertLabel: string;
  alertType: string;
  alertStatus: string;
  companion: { id: string; firstName: string };
  kind: 'room' | 'circleChat';
  // The outer-circle Sentinel a circle chat was opened by (null for the room).
  outsider: { id: string; firstName: string } | null;
  // "Writable until": in the future during a closed alert's 7 days, then
  // read-only. null while the alert runs.
  closedAt: string | null;
  lastMessage: { body: string; type: MessageType; createdAt: string } | null;
  unreadCount: number;
  // The names I may see (an outer-circle Sentinel: only theirs and the
  // companion's; the others show as "1st circle").
  senders: { id: string; firstName: string }[];
}

export const listMyAlertChats = () => apiGet<AlertChatSummary[]>('/messaging/alert-chats');

export const isChatClosed = (c: Pick<AlertChatSummary, 'closedAt'>) =>
  c.closedAt !== null && new Date(c.closedAt) <= new Date();

// A message's image, fetched with my token (it's not a public file).
export async function fetchMessageImageBlob(messageId: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_URL}/messaging/messages/${messageId}/image`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}
