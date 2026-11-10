import { AlertType } from '@prisma/client';
import { isSubscribed } from '../user/plan.util';

// Watch Mode's rules that both the service (what the person does) and the
// scheduler (what time does) rely on. Plain functions, no database.

export type WatchMode = 'TRIP' | 'ALL_GOOD';

// A trip is a TRAVEL watch, the All Good Check a NOCONTACT one — the same
// type the alert it opens when a deadline is missed.
export function watchType(mode: WatchMode): AlertType {
  return mode === 'TRIP' ? AlertType.TRAVEL : AlertType.NOCONTACT;
}

export function modeOf(alertType: AlertType): WatchMode {
  return alertType === AlertType.TRAVEL ? 'TRIP' : 'ALL_GOOD';
}

export const ALL_GOOD_LABEL = 'Check tout va bien';
export const FIRST_TRAVEL_CIRCLE_LABEL = 'Cercle du voyage 1';

// Why nothing happens at the deadlines right now (no reminder, no alert):
// - SUBSCRIPTION: it ended, until someone pays;
// - MANUAL: the person paused it (All Good, "Mettre en pause jusqu'au…");
// - TRIP: an All Good Check rests while the person is on a trip.
export type PauseReason = 'SUBSCRIPTION' | 'MANUAL' | 'TRIP';

export function pauseReason(
  watch: { alertType: AlertType; pausedUntil: Date | null },
  owner: { paidUntil: Date | null },
  ownerOnTrip: boolean,
  now: Date,
): PauseReason | null {
  if (!isSubscribed(owner, now)) return 'SUBSCRIPTION';
  if (watch.pausedUntil && watch.pausedUntil > now) return 'MANUAL';
  if (modeOf(watch.alertType) === 'ALL_GOOD' && ownerOnTrip) return 'TRIP';
  return null;
}

interface CheckpointLike {
  id: string;
  expectedAt: Date;
  alertAt: Date;
  validatedAt: Date | null;
  missedAt: Date | null;
  openedAlertId: string | null;
}

// The delay the person chose between the deadline and the alert.
export function delayMs(checkpoint: CheckpointLike): number {
  return checkpoint.alertAt.getTime() - checkpoint.expectedAt.getTime();
}

// Still ahead: neither validated nor missed.
export function isPending(checkpoint: CheckpointLike): boolean {
  return !checkpoint.validatedAt && !checkpoint.missedAt;
}

// What "Je suis là" / "Tout va bien" answers: first a missed deadline
// whose alert is still running (saying all is well answers that alert),
// else the earliest deadline still ahead.
export function currentCheckpoint<T extends CheckpointLike>(
  checkpoints: T[],
  runningAlertIds: string[],
): T | null {
  const answersAlert = checkpoints
    .filter(
      (c) =>
        !c.validatedAt &&
        c.missedAt &&
        c.openedAlertId &&
        runningAlertIds.includes(c.openedAlertId),
    )
    .sort((a, b) => b.expectedAt.getTime() - a.expectedAt.getTime())[0];
  if (answersAlert) return answersAlert;
  return (
    checkpoints
      .filter(isPending)
      .sort((a, b) => a.expectedAt.getTime() - b.expectedAt.getTime())[0] ??
    null
  );
}

// When the 1st circle is told: at alertAt, but never sooner than a full
// delay after the reminder — a reminder sent late (the watch was paused,
// the server was down) still leaves the person the time they chose.
export function effectiveAlertAt(checkpoint: {
  expectedAt: Date;
  alertAt: Date;
  remindedAt: Date | null;
}): Date | null {
  if (!checkpoint.remindedAt) return null;
  const delay = checkpoint.alertAt.getTime() - checkpoint.expectedAt.getTime();
  return new Date(
    Math.max(
      checkpoint.alertAt.getTime(),
      checkpoint.remindedAt.getTime() + delay,
    ),
  );
}
