import { apiGet, apiPost } from './client';

export type AlertType = 'BYCOMPANION' | 'LITTLEWORRY' | 'MISSING' | 'INCIDENT' | 'UNKNOWN' | 'EMERGENCY' | 'NOCONTACT';
export type AlertStatus = 'SENT' | 'LAUNCHED' | 'ACTIVE' | 'CLOSING' | 'RESOLVED';

export interface AlertSummary {
  id: string;
  createdAt: string;
  launchedAt: string | null;
  closedAt: string | null;
  label: string;
  messageAlert: string;
  alertStatus: AlertStatus;
  alertType: AlertType;
  userCompanionId: string;
  firstCircleId: string;
  launchedById: string | null;
  closedById: string | null;
}

export interface AlertParticipant {
  id: string;
  status: string;
  isLead: boolean;
  circleId: string;
  circleName: string;
  response: string | null;
  userSentinelsId: string;
  userSentinels: { linkAsSentinel: { id: string; firstName: string } };
}

export interface AlertDetail extends AlertSummary {
  userCompanion: { id: string; firstName: string; myCircles: { id: string; label: string }[] };
  participants: AlertParticipant[];
  conversations: { id: string; closedAt: string | null }[];
}

// Not the bare /alert root — nginx's reverse-proxy requires a trailing path
// segment on every module's location block (see nginx/nginx.conf).
export const raiseAlert = (data: { companionId: string; alertType: AlertType; reason: string }) =>
  apiPost<AlertSummary>('/alert/raise', data);

export const closeAlert = (id: string) => apiPost<AlertSummary>(`/alert/${id}/close`, {});

export const listAlerts = () => apiGet<AlertSummary[]>('/alert/mine');

export const getAlert = (id: string) => apiGet<AlertDetail>(`/alert/${id}`);

export const requestCircle = (id: string, data: { circleId: string; question: string }) =>
  apiPost<AlertDetail>(`/alert/${id}/request-circle`, data);

// Returns the updated participant, not the full alert detail — the caller
// may be an outer-circle Sentinel, who can't view the full alert.
export const respondToAlert = (id: string, accepted: boolean) =>
  apiPost<AlertParticipant>(`/alert/${id}/respond`, { accepted });
