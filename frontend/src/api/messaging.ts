import { apiGet, apiPost, apiPostForm } from './client';

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

// body is just the stored filename (see api/user.ts's uploadAvatar for the
// same pattern) — render it as `${API_URL}/uploads/messages/${message.body}`.
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
// conversation with userId. Rejects (403) if messaging isn't currently
// allowed between the two (see sentinel.ts's canMessageMe cascade).
export const getDirectConversation = (userId: string) =>
  apiGet<DirectConversation>(`/messaging/direct/${userId}`);
