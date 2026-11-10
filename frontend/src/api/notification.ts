import type { Gender } from '../gender';
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
  | 'SENTINEL_LEFT'
  | 'SENTINEL_TO_RESERVE'
  | 'CIRCLE_MOVE_PROPOSED'
  | 'CIRCLE_MOVE_ANSWERED'
  | 'SENTINEL_GROUP_INVITED'
  | 'DEATH_NOTICE_REPORTED'
  | 'DEATH_NOTICE_CONFIRMED'
  | 'DEATH_NOTICE_REJECTED'
  // Watch Mode.
  | 'TRAVEL_CIRCLE_ADDED'
  | 'WATCH_CHECK_DUE'
  | 'WATCH_PAUSE_SOON';

export interface NotificationItem {
  id: string;
  createdAt: string;
  readAt: string | null;
  type: NotificationType;
  actorUserId: string | null;
  actorLabel: string | null;
  // How the text speaks about whoever triggered it; null = inclusive.
  actorGender?: Gender | null;
  accepted: boolean | null;
  targetId: string | null;
}

// Unread only — read notifications are never listed again. New messages are
// left out server-side: they show on the Messages tab, not in the bell.
export const listNotifications = () => apiGet<NotificationItem[]>('/notification/mine');

// `count` = unread notifications except messages (bell); `messages` =
// unread messages (Messages tab badge); `support` = unread replies in my
// feedback thread (About tab badge — that thread isn't in Messages).
export const getUnreadCount = () =>
  apiGet<{ count: number; messages: number; support: number }>('/notification/unread-count');

export const markNotificationRead = (id: string) => apiPost<{ count: number }>(`/notification/${id}/read`, {});

// Fired by pages that mark notifications read on their own (e.g. opening a
// conversation), so the bell's count refreshes right after.
export const NOTIFICATIONS_CHANGED = 'notifications:changed';
