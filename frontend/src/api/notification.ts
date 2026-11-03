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
  | 'SENTINEL_GROUP_INVITED'
  | 'DEATH_NOTICE_REPORTED'
  | 'DEATH_NOTICE_CONFIRMED'
  | 'DEATH_NOTICE_REJECTED';

export interface NotificationItem {
  id: string;
  createdAt: string;
  readAt: string | null;
  type: NotificationType;
  actorUserId: string | null;
  actorLabel: string | null;
  accepted: boolean | null;
  targetId: string | null;
}

// Unread only — read notifications are never listed again.
export const listNotifications = () => apiGet<NotificationItem[]>('/notification/mine');

export const getUnreadCount = () => apiGet<{ count: number }>('/notification/unread-count');

export const markNotificationRead = (id: string) => apiPost<{ count: number }>(`/notification/${id}/read`, {});

// Fired by pages that mark notifications read on their own (e.g. opening a
// conversation), so the bell's count refreshes right after.
export const NOTIFICATIONS_CHANGED = 'notifications:changed';
