import type { Checkpoint } from './watch';
import type { Gender } from '../gender';
import { apiGet, apiGetShared, apiPatch, apiPost } from './client';

export type AlertType =
  | 'BYCOMPANION'
  | 'LITTLEWORRY'
  | 'MISSING'
  | 'INCIDENT'
  | 'UNKNOWN'
  | 'EMERGENCY'
  | 'NOCONTACT'
  | 'TRAVEL';
export type AlertStatus = 'SENT' | 'LAUNCHED' | 'ACTIVE' | 'CLOSING' | 'RESOLVED';

export const ALERT_QUESTION_KINDS = ['CAN_VISIT', 'LAST_NEWS', 'SEEMED_OK', 'WHERE_SEEN'] as const;
export type AlertQuestionKind = (typeof ALERT_QUESTION_KINDS)[number];

export const FIRST_CIRCLE_REPLY_CODES = ['GOING', 'LATER', 'UNAVAILABLE'] as const;

// WHERE_SEEN is answered in free text.
export const QUESTION_REPLY_CODES: Record<AlertQuestionKind, readonly string[]> = {
  CAN_VISIT: ['YES', 'LATER', 'NO'],
  LAST_NEWS: ['TODAY', 'THIS_WEEK', 'LONGER'],
  SEEMED_OK: ['YES', 'NO', 'DONT_KNOW'],
  WHERE_SEEN: [],
};

export const KNOWN_REPLY_CODES = new Set<string>([
  ...FIRST_CIRCLE_REPLY_CODES,
  ...Object.values(QUESTION_REPLY_CODES).flat(),
]);

export interface AlertQuestion {
  id: string;
  kind: AlertQuestionKind;
  response: string | null;
  answeredAt: string | null;
  createdAt: string;
  askedById: string;
}

export interface AlertSummary {
  id: string;
  createdAt: string;
  launchedAt: string | null;
  // Set when the responsible Lead marked the person found (CLOSING).
  closingAt: string | null;
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
  // Opened by a missed Watch Mode deadline: the watch (trip or All Good).
  tripId?: string | null;
}

// listAlerts() rows only: the caller's own participation (null on their own
// alert), to tell whether an alert needs them to act.
export interface MyAlertSummary extends AlertSummary {
  myParticipation: { status: string; circleId: string } | null;
  // Who the alert is about.
  userCompanion: { firstName: string; lastName: string | null; gender?: Gender | null };
}

// Needs the caller now: it's their own alert, they're in its 1st circle
// (and haven't left), or they've been asked a question still unanswered.
export function alertNeedsMe(alert: MyAlertSummary, userId: string | undefined): boolean {
  if (alert.alertStatus === 'RESOLVED') return false;
  if (alert.userCompanionId === userId) return true;
  const mine = alert.myParticipation;
  if (!mine || mine.status === 'CLOSED') return false;
  return mine.circleId === alert.firstCircleId || mine.status === 'CONTACTED';
}

// Outside the companion's 1st circle: such a viewer only sees the alert's
// name, statuses and their own answer, not its details.
export function isOuterCircleViewer(alert: MyAlertSummary, userId: string | undefined): boolean {
  return alert.userCompanionId !== userId && alert.myParticipation?.circleId !== alert.firstCircleId;
}

export interface AlertParticipant {
  id: string;
  status: string;
  isLead: boolean;
  // When this Lead last claimed active leadership of the alert (null if
  // never claimed). Whoever has the latest value among isLead participants
  // is the current lead — see claimLead below.
  leadAssignedAt: string | null;
  contactedAt: string | null;
  // When they last answered (their own 1st-circle answer, or a question).
  answeredAt: string | null;
  circleId: string;
  circleName: string;
  response: string | null;
  userSentinelsId: string;
  // Who triggered contacting this Sentinel — "Me" raising for themself,
  // another Sentinel raising on their behalf, or whoever called
  // requestCircle for this outer circle.
  requestedBy: { id: string; firstName: string } | null;
  // avatarPath: their photo's cache key (see avatars.ts).
  userSentinels: {
    linkAsSentinel: {
      id: string;
      firstName: string;
      avatarPath?: string | null;
      pausedForOthers?: boolean;
      gender?: Gender | null;
    };
  };
  questions: AlertQuestion[];
}

export interface AlertDetail extends AlertSummary {
  userCompanion: {
    id: string;
    firstName: string;
    gender?: Gender | null;
    // tripId: a travel circle (Watch Mode).
    myCircles: { id: string; label: string; tripId?: string | null }[];
  };
  // Opened by a missed Watch Mode deadline: the watch, seen in full by the
  // 1st circle from now on.
  trip?: {
    id: string;
    label: string;
    alertType: AlertType;
    messageAlert: string;
    createdAt: string;
    closedAt: string | null;
    checkpoints: Checkpoint[];
    tripCircles: { id: string; label: string }[];
  } | null;
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
  type: 'ALERT_RAISED' | 'CONTACTED' | 'RESPONDED' | 'LEAD_CLAIMED' | 'LEFT' | 'ALERT_CLOSED';
  at: string;
  actorLabel: string;
  detail?: string;
}

// Not the bare /alert root — nginx's reverse-proxy requires a trailing path
// segment on every module's location block (see nginx/nginx.conf).
// Where the person is, from their phone (only when raising for oneself).
export interface AlertLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export const raiseAlert = (data: {
  companionId: string;
  alertType: AlertType;
  reason: string;
  location?: AlertLocation;
  // Past the free alert, with no subscription: I pay for this one alert.
  payForThisAlert?: boolean;
}) =>
  apiPost<AlertSummary>('/alert/raise', data);

// The person the alert is about sends where they are now.
export const updateAlertLocation = (id: string, location: AlertLocation) =>
  apiPatch<AlertSummary>(`/alert/${id}/location`, location);

// finalWord: optional closing words — the stopper's status, posted in the
// alert's chats and sent in the end-of-alert SMS.
export const closeAlert = (id: string, finalWord?: string) =>
  apiPost<AlertSummary>(`/alert/${id}/close`, finalWord ? { finalWord } : {});

export const claimLead = (id: string) => apiPost<AlertDetail>(`/alert/${id}/claim-lead`, {});


// "I can't help anymore": the caller's participation becomes CLOSED. A Lead
// can only leave once another Lead has taken the lead after them.
export const leaveAlert = (id: string) => apiPost<AlertParticipant>(`/alert/${id}/leave`, {});

// Shared between pages for a few seconds (see apiGetShared).
export const listAlerts = () => apiGetShared<MyAlertSummary[]>('/alert/mine');

export const getAlert = (id: string) => apiGet<AlertDetail>(`/alert/${id}`);

export const requestCircle = (id: string, data: { circleId: string; questionKind: AlertQuestionKind }) =>
  apiPost<AlertDetail>(`/alert/${id}/request-circle`, data);

export const askQuestion = (id: string, data: { questionKind: AlertQuestionKind; participantIds: string[] }) =>
  apiPost<AlertDetail>(`/alert/${id}/questions`, data);

// Returns the updated participant, not the full alert detail — the caller
// may be an outer-circle Sentinel, who can't view the full alert.
export const respondToAlert = (id: string, reply: string, questionId?: string) =>
  apiPost<AlertParticipant>(`/alert/${id}/respond`, { reply, questionId });

export interface MyParticipation {
  id: string;
  status: string;
  response: string | null;
  circleName: string;
  isLead: boolean;
  // Whether this Sentinel may chat with the 1st circle during this alert
  // (their circle's rule, frozen when the circle was solicited).
  alertChatWithFirstCircleAtAlert: boolean | null;
  questions: AlertQuestion[];
  alert: {
    id: string;
    alertStatus: AlertStatus;
    label: string;
    messageAlert: string;
    statusByCompanion: string | null;
    statusByFirstCircle: string | null;
    userCompanion: { firstName: string; gender?: Gender | null };
  };
}

// Lightweight counterpart to getAlert() — reachable by a participant of any
// circle, not just the 1st (getAlert() itself 403s an outer-circle Sentinel).
export const getMyParticipation = (id: string) => apiGet<MyParticipation>(`/alert/${id}/my-participation`);

// Lazily opens (or returns the existing) isolated chat between the calling
// outer-circle Sentinel and the 1st circle — own conversation per
// requester, not shared. 403s unless alertChatWithFirstCircleAtAlert is
// true.
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

// An alert opened by a missed Watch Mode deadline, requalified by the 1st
// circle: a disappearance, an emergency, or back to its own type.
export const updateAlertType = (alertId: string, alertType: AlertType) =>
  apiPatch<AlertDetail>(`/alert/${alertId}/type`, { alertType });
