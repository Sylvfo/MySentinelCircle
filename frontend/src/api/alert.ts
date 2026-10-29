import { apiGet, apiPatch, apiPost } from './client';

export type AlertType = 'BYCOMPANION' | 'LITTLEWORRY' | 'MISSING' | 'INCIDENT' | 'UNKNOWN' | 'EMERGENCY' | 'NOCONTACT';
export type AlertStatus = 'SENT' | 'LAUNCHED' | 'ACTIVE' | 'CLOSING' | 'RESOLVED';

export interface AlertSummary {
  id: string;
  createdAt: string;
  launchedAt: string | null;
  closedAt: string | null;
  label: string;
  messageAlert: string;
  statusByCompanion: string | null;
  statusByFirstCircle: string | null;
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
  // When this Lead last claimed active leadership of the alert (null if
  // never claimed). Whoever has the latest value among isLead participants
  // is the current lead — see claimLead below.
  leadAssignedAt: string | null;
  circleId: string;
  circleName: string;
  response: string | null;
  userSentinelsId: string;
  // Who triggered contacting this Sentinel — "Me" raising for themself,
  // another Sentinel raising on their behalf, or whoever called
  // requestCircle for this outer circle.
  requestedBy: { id: string; firstName: string } | null;
  userSentinels: { linkAsSentinel: { id: string; firstName: string } };
}

export interface AlertDetail extends AlertSummary {
  userCompanion: { id: string; firstName: string; myCircles: { id: string; label: string }[] };
  // Who last wrote statusByFirstCircle (statusByCompanion is always the
  // companion, no ambiguity there) / renamed the alert — last writer only.
  statusUpdatedBy: { id: string; firstName: string } | null;
  labelUpdatedBy: { id: string; firstName: string } | null;
  participants: AlertParticipant[];
  conversations: {
    id: string;
    closedAt: string | null;
    // Which Sentinels are in this conversation — tells the main 1st-circle
    // chat apart from an isolated outer-circle-Sentinel chat (the latter
    // has one participant outside the 1st circle).
    participants: { user: { id: string; firstName: string } }[];
    // Embedded so the companion (not a ConversationParticipant, by design)
    // can still read the full history as part of the alert detail.
    messages: { id: string; body: string; createdAt: string; sender: { id: string; firstName: string } }[];
  }[];
  // Chronological view of everything that's happened on this alert,
  // assembled server-side from the same data as `participants` above —
  // same companion/1st-circle-only visibility as the rest of AlertDetail.
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  type: 'ALERT_RAISED' | 'CONTACTED' | 'RESPONDED' | 'LEAD_CLAIMED' | 'ALERT_CLOSED';
  at: string;
  actorLabel: string;
  detail?: string;
}

// Not the bare /alert root — nginx's reverse-proxy requires a trailing path
// segment on every module's location block (see nginx/nginx.conf).
export const raiseAlert = (data: { companionId: string; alertType: AlertType; reason: string }) =>
  apiPost<AlertSummary>('/alert/raise', data);

export const closeAlert = (id: string) => apiPost<AlertSummary>(`/alert/${id}/close`, {});

export const claimLead = (id: string) => apiPost<AlertDetail>(`/alert/${id}/claim-lead`, {});

export const listAlerts = () => apiGet<AlertSummary[]>('/alert/mine');

export const getAlert = (id: string) => apiGet<AlertDetail>(`/alert/${id}`);

export const requestCircle = (id: string, data: { circleId: string; question: string }) =>
  apiPost<AlertDetail>(`/alert/${id}/request-circle`, data);

// Returns the updated participant, not the full alert detail — the caller
// may be an outer-circle Sentinel, who can't view the full alert.
export const respondToAlert = (id: string, accepted: boolean) =>
  apiPost<AlertParticipant>(`/alert/${id}/respond`, { accepted });

export interface MyParticipation {
  id: string;
  status: string;
  response: string | null;
  circleName: string;
  isLead: boolean;
  // Whether this link is authorized to chat with the 1st circle during an
  // alert (NONE = not authorized, the default).
  firstCircleMessagingModeAtAlert: 'NONE' | 'INDIVIDUAL' | 'GROUP' | null;
  alert: {
    id: string;
    alertStatus: AlertStatus;
    label: string;
    messageAlert: string;
    statusByCompanion: string | null;
    statusByFirstCircle: string | null;
    userCompanion: { firstName: string };
  };
}

// Lightweight counterpart to getAlert() — reachable by a participant of any
// circle, not just the 1st (getAlert() itself 403s an outer-circle Sentinel).
export const getMyParticipation = (id: string) => apiGet<MyParticipation>(`/alert/${id}/my-participation`);

// Lazily opens (or returns the existing) isolated chat between the calling
// outer-circle Sentinel and the 1st circle — own conversation per
// requester, not shared. 403s unless firstCircleMessagingModeAtAlert is
// authorized.
export const requestCircleChat = (id: string) =>
  apiGet<{ id: string; closedAt: string | null }>(`/alert/${id}/circle-chat`);

// Two separate live status notes, not one shared field — the companion
// writes statusByCompanion, any accepted 1st-circle Sentinel writes
// statusByFirstCircle (the backend picks which one based on the caller).
// Stays writable after the alert is resolved.
export const updateAlertStatus = (id: string, message: string) =>
  apiPatch<AlertSummary>(`/alert/${id}/status`, { message });

// label is the alert's name — any accepted 1st-circle Sentinel can set it.
export const updateAlertLabel = (id: string, label: string) =>
  apiPatch<AlertSummary>(`/alert/${id}/label`, { label });
