import { apiGet, apiPost } from './client';

export type NotificationType =
  | 'ALERT_RAISED'
  | 'ALERT_ESCALATED'
  | 'ALERT_RESPONSE'
  | 'ALERT_CLOSED'
  | 'ALERT_CIRCLE_NO_RESPONSE'
  | 'ALERT_LEAD_CLAIMED'
  | 'NEW_MESSAGE'
  | 'SENTINEL_INVITATION_RECEIVED'
  | 'SENTINEL_REQUEST_RECEIVED'
  | 'SENTINEL_LINK_ANSWERED'
  | 'SENTINEL_GROUP_INVITED';

export interface NotificationItem {
  id: string;
  createdAt: string;
  readAt: string | null;
  type: NotificationType;
  actorLabel: string | null;
  accepted: boolean | null;
  targetId: string | null;
}

export const listNotifications = () => apiGet<NotificationItem[]>('/notification/mine');

export const getUnreadCount = () => apiGet<{ count: number }>('/notification/unread-count');

export const markNotificationRead = (id: string) => apiPost<{ count: number }>(`/notification/${id}/read`, {});
