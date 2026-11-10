import { AlertStatus } from '@prisma/client';

// An Alert in SENT is a watch (Watch Mode: a trip or an All Good Check),
// "watched, nobody told" — not an alert. It stays SENT for its whole life;
// its end is closedAt. A missed checkpoint opens a separate, real alert
// (LAUNCHED, linked by Alert.tripId).

// "An alert in progress": what blocks, notifies or counts as running.
// A watch never does.
export const RUNNING_ALERT = {
  notIn: [AlertStatus.SENT, AlertStatus.RESOLVED],
};

// Every real alert, running or closed — lists, history, counts.
export const NOT_A_WATCH = { not: AlertStatus.SENT };

// A watch still going (not ended).
export const RUNNING_WATCH = {
  alertStatus: AlertStatus.SENT,
  closedAt: null,
};

// The alert routes (close, lead, chats, status…) never act on a watch:
// to them, it doesn't exist. Watch Mode has its own (watch module).
export function isWatch(alert: { alertStatus: AlertStatus }): boolean {
  return alert.alertStatus === AlertStatus.SENT;
}
