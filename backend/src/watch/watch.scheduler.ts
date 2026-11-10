import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  LinkStatus,
  MessageType,
  NotificationType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALERT_TYPE_LABELS,
  AlertService,
  companionFullName,
} from '../alert/alert.service';
import { NotificationService } from '../notification/notification.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import {
  smsLang,
  watchAlertSms,
  watchAlertToOwnerSms,
  watchAllGoodReminderSms,
  watchStepReminderSms,
} from '../sms/messages';
import { RUNNING_ALERT, RUNNING_WATCH } from '../common/running-alert';
import { deadlineParts, timeZoneOrDefault } from './zoned-time';
import {
  effectiveAlertAt,
  isPending,
  modeOf,
  pauseReason,
} from './watch-rules';
import { WatchService } from './watch.service';

const DAY_MS = 86_400_000;

// Before a subscription ends during a watch: the person is told 30, 7 and
// 1 days before, their 1st circle 7 days before (the watch then pauses).
const OWNER_PAUSE_REMINDER_DAYS = [1, 7, 30];
const FIRST_CIRCLE_PAUSE_REMINDER_DAYS = 7;

const WATCH_SELECT = {
  id: true,
  label: true,
  messageAlert: true,
  alertType: true,
  pausedUntil: true,
  checkInSchedule: true,
  userCompanionId: true,
  firstCircleId: true,
  userCompanion: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      language: true,
      gender: true,
      timeZone: true,
      paidUntil: true,
    },
  },
} satisfies Prisma.AlertSelect;

type RunningWatch = Prisma.AlertGetPayload<{ select: typeof WATCH_SELECT }>;
type Checkpoint = Prisma.TravelCheckpointGetPayload<object>;
type Deadline = ReturnType<typeof deadlineParts>;

// "à 13:00" / "le 11.11 à 13:00" — generated texts the app shows.
function sayDeadline(d: Deadline): string {
  return d.date ? `le ${d.date} à ${d.time}` : `à ${d.time}`;
}

// What time does to watches: at a deadline, a reminder to the person; at
// its alert time, still nothing → an alert for their 1st circle. Each step
// claims its checkpoint with a conditional update first, so a tick that
// overlaps another (or a second server) never sends anything twice.
@Injectable()
export class WatchScheduler {
  private readonly logger = new Logger(WatchScheduler.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertService,
    private readonly watches: WatchService,
    private readonly notifications: NotificationService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(REALTIME_NOTIFIER) private readonly notifier: RealtimeNotifier,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runDeadlines(new Date());
    } catch (err) {
      this.logger.error(`Watch deadlines failed: ${String(err)}`);
    } finally {
      this.busy = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    try {
      await this.runSubscriptionReminders(new Date());
    } catch (err) {
      this.logger.error(`Watch subscription reminders failed: ${String(err)}`);
    }
  }

  // `ownerIds`: only these people's watches (the test lab's "advance the
  // time", which must not touch other testers' watches).
  async runDeadlines(now: Date, ownerIds?: string[]) {
    // A confirmed death freezes the account: nobody is told anything more.
    await this.prisma.alert.updateMany({
      where: {
        ...RUNNING_WATCH,
        userCompanion: { status: UserStatus.DECEASED },
      },
      data: { closedAt: now },
    });

    const watches = await this.prisma.alert.findMany({
      where: {
        ...RUNNING_WATCH,
        ...(ownerIds ? { userCompanionId: { in: ownerIds } } : {}),
      },
      select: WATCH_SELECT,
    });
    if (watches.length === 0) return;
    const byId = new Map(watches.map((w) => [w.id, w]));
    const onTrip = new Set(
      watches
        .filter((w) => modeOf(w.alertType) === 'TRIP')
        .map((w) => w.userCompanionId),
    );

    const due = await this.prisma.travelCheckpoint.findMany({
      where: {
        alertId: { in: [...byId.keys()] },
        validatedAt: null,
        missedAt: null,
        expectedAt: { lte: now },
      },
      orderBy: { expectedAt: 'asc' },
    });
    for (const checkpoint of due) {
      const watch = byId.get(checkpoint.alertId)!;
      try {
        await this.handleDue(watch, checkpoint, onTrip, now);
      } catch (err) {
        this.logger.error(
          `Watch checkpoint ${checkpoint.id} failed: ${String(err)}`,
        );
      }
    }
  }

  private async handleDue(
    watch: RunningWatch,
    checkpoint: Checkpoint,
    onTrip: Set<string>,
    now: Date,
  ) {
    const paused = pauseReason(
      watch,
      watch.userCompanion,
      onTrip.has(watch.userCompanionId),
      now,
    );
    if (paused) {
      // A paused All Good Check skips its deadlines rather than piling
      // them up for the day it resumes. A paused trip keeps its steps:
      // once it resumes, the reminder comes first, then a full delay.
      if (modeOf(watch.alertType) === 'ALL_GOOD') {
        await this.skipDeadline(watch, checkpoint, now);
      }
      return;
    }
    if (!checkpoint.remindedAt) {
      await this.remind(watch, checkpoint, now);
      return;
    }
    if (effectiveAlertAt(checkpoint)! <= now) {
      await this.miss(watch, checkpoint, now);
    }
  }

  private async skipDeadline(
    watch: RunningWatch,
    checkpoint: Checkpoint,
    now: Date,
  ) {
    const next = await this.watches.nextAllGoodCheckpoint(
      watch,
      checkpoint,
      now,
    );
    if (!next) return;
    await this.prisma.travelCheckpoint.updateMany({
      where: { id: checkpoint.id, validatedAt: null, missedAt: null },
      data: {
        expectedAt: next.expectedAt,
        alertAt: next.alertAt,
        remindedAt: null,
      },
    });
  }

  private async remind(watch: RunningWatch, checkpoint: Checkpoint, now: Date) {
    const claimed = await this.prisma.travelCheckpoint.updateMany({
      where: { id: checkpoint.id, remindedAt: null },
      data: { remindedAt: now },
    });
    if (claimed.count === 0) return;

    const owner = watch.userCompanion;
    const zone = timeZoneOrDefault(owner.timeZone);
    const alertAt = effectiveAlertAt({ ...checkpoint, remindedAt: now })!;
    const lang = smsLang(owner.language);
    if (owner.phone) {
      const text =
        modeOf(watch.alertType) === 'TRIP'
          ? watchStepReminderSms(
              checkpoint.placeName ?? watch.label,
              deadlineParts(checkpoint.expectedAt, zone, now),
              deadlineParts(alertAt, zone, now),
              owner.gender,
              lang,
            )
          : watchAllGoodReminderSms(deadlineParts(alertAt, zone, now), lang);
      await this.sendSms(owner.phone, text);
    }
    await this.notifications.create({
      userId: owner.id,
      type: NotificationType.WATCH_CHECK_DUE,
      targetId: watch.id,
    });
    this.notifier.notifyAlertChanged(owner.id, watch.id);
  }

  // Still nothing at the alert time. Another alert about the person is
  // already running: no second one, the news goes into that alert's room.
  // Otherwise a separate alert opens for the 1st circle, linked to the
  // watch (Alert.tripId); the watch itself goes on.
  private async miss(watch: RunningWatch, checkpoint: Checkpoint, now: Date) {
    const claimed = await this.prisma.travelCheckpoint.updateMany({
      where: { id: checkpoint.id, missedAt: null, validatedAt: null },
      data: { missedAt: now },
    });
    if (claimed.count === 0) return;

    const owner = watch.userCompanion;
    const zone = timeZoneOrDefault(owner.timeZone);
    const due = deadlineParts(checkpoint.expectedAt, zone, now);
    const isTrip = modeOf(watch.alertType) === 'TRIP';
    const what = isTrip
      ? `Étape « ${checkpoint.placeName ?? ''} » du voyage « ${watch.label} », ` +
        `prévue ${sayDeadline(due)}, non validée.`
      : `Check tout va bien prévu ${sayDeadline(due)} non validé.`;

    const running = await this.prisma.alert.findFirst({
      where: { userCompanionId: owner.id, alertStatus: RUNNING_ALERT },
      select: {
        id: true,
        conversations: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, closedAt: true },
        },
      },
    });
    if (running) {
      const room = running.conversations[0];
      if (room && !room.closedAt) {
        await this.prisma.message.create({
          data: {
            conversationId: room.id,
            senderId: owner.id,
            type: MessageType.TEXT,
            body: `⏰ ${what}`,
          },
        });
      }
      await this.alerts.notifyAlertParticipants(running.id);
    } else {
      await this.openAlert(watch, checkpoint, what, due);
    }

    // The All Good rhythm goes on: the next deadline.
    if (!isTrip) {
      const ahead = await this.prisma.travelCheckpoint.findMany({
        where: { alertId: watch.id, validatedAt: null, missedAt: null },
      });
      if (!ahead.some(isPending)) {
        const next = await this.watches.nextAllGoodCheckpoint(
          watch,
          checkpoint,
          now,
        );
        if (next) await this.prisma.travelCheckpoint.create({ data: next });
      }
    }
  }

  private async openAlert(
    watch: RunningWatch,
    checkpoint: Checkpoint,
    what: string,
    due: Deadline,
  ) {
    const owner = watch.userCompanion;
    let firstCircle: Awaited<
      ReturnType<AlertService['loadFirstCircleForAlert']>
    >;
    try {
      firstCircle = await this.alerts.loadFirstCircleForAlert(owner.id, {
        requireLead: false,
      });
    } catch {
      this.logger.warn(
        `Watch ${watch.id}: a deadline was missed but nobody can be told`,
      );
      return;
    }
    const instructions = watch.messageAlert.trim();
    const alert = await this.alerts.openAlert({
      companionId: owner.id,
      circle: firstCircle.circle,
      links: firstCircle.links,
      alertType: watch.alertType,
      label: ALERT_TYPE_LABELS[watch.alertType],
      messageAlert: instructions
        ? `${what}\n\nQue faire : ${instructions}`
        : what,
      launchedById: null,
      paidById: null,
      tripId: watch.id,
    });
    await this.prisma.travelCheckpoint.update({
      where: { id: checkpoint.id },
      data: { openedAlertId: alert.id },
    });

    const missed =
      modeOf(watch.alertType) === 'TRIP'
        ? {
            kind: 'STEP' as const,
            place: checkpoint.placeName ?? '',
            due,
            tripName: watch.label,
          }
        : { kind: 'ALL_GOOD' as const, due };
    await this.alerts.notifyParticipants(alert.id, firstCircle.links, (lang) =>
      watchAlertSms(companionFullName(owner), missed, instructions, lang),
    );
    if (owner.phone) {
      await this.sendSms(
        owner.phone,
        watchAlertToOwnerSms(smsLang(owner.language)),
      );
    }
    await this.alerts.notifyAlertParticipants(alert.id, {
      type: NotificationType.ALERT_RAISED,
    });
  }

  // ---- Subscription ending during a watch ----------------------------------

  async runSubscriptionReminders(now: Date) {
    const watches = await this.prisma.alert.findMany({
      where: {
        ...RUNNING_WATCH,
        userCompanion: {
          paidUntil: {
            gt: now,
            lte: new Date(now.getTime() + 30 * DAY_MS),
          },
        },
      },
      select: {
        id: true,
        firstCircleId: true,
        userCompanionId: true,
        userCompanion: { select: { paidUntil: true, firstName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // One reminder per person, whatever the number of their watches.
    const byOwner = new Map(watches.map((w) => [w.userCompanionId, w]));
    for (const watch of byOwner.values()) {
      const paidUntil = watch.userCompanion.paidUntil!;
      const days = OWNER_PAUSE_REMINDER_DAYS.find(
        (d) => now.getTime() >= paidUntil.getTime() - d * DAY_MS,
      );
      if (days !== undefined) {
        await this.remindOnce(
          watch.userCompanionId,
          new Date(paidUntil.getTime() - days * DAY_MS),
          { targetId: watch.id },
        );
      }
      const circleFrom = new Date(
        paidUntil.getTime() - FIRST_CIRCLE_PAUSE_REMINDER_DAYS * DAY_MS,
      );
      if (now < circleFrom) continue;
      const members = await this.prisma.linkSentinels.findMany({
        where: { circleId: watch.firstCircleId, status: LinkStatus.ACCEPTED },
        select: { userSentinelId: true },
      });
      for (const m of members) {
        await this.remindOnce(m.userSentinelId, circleFrom, {
          actorUserId: watch.userCompanionId,
          actorLabel: watch.userCompanion.firstName,
          targetId: watch.userCompanionId,
        });
      }
    }
  }

  // Sent unless this person already got this reminder since `since`.
  private async remindOnce(
    userId: string,
    since: Date,
    about: { actorUserId?: string; actorLabel?: string; targetId: string },
  ) {
    const already = await this.prisma.notification.count({
      where: {
        userId,
        type: NotificationType.WATCH_PAUSE_SOON,
        actorUserId: about.actorUserId ?? null,
        createdAt: { gte: since },
      },
    });
    if (already > 0) return;
    await this.notifications.create({
      userId,
      type: NotificationType.WATCH_PAUSE_SOON,
      ...about,
    });
  }

  private async sendSms(phone: string, text: string) {
    try {
      await this.sms.send(phone, text);
    } catch (err) {
      this.logger.error(`Watch SMS failed: ${String(err)}`);
    }
  }
}
