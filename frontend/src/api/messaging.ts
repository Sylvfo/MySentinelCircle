import { apiGet, apiPost } from './client';

export interface Message {
  id: string;
  body: string;
  senderId: string;
  conversationId: string;
  createdAt: string;
}

export const sendMessage = (conversationId: string, body: string) =>
  apiPost<Message>(`/messaging/conversations/${conversationId}/messages`, { body });

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
