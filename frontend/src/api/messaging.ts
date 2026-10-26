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
