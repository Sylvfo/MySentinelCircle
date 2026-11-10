import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertStatus, LinkStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RUNNING_ALERT } from '../common/running-alert';
import { DELETED_ACCOUNT_LABEL } from '../user/user-status.util';
import {
  POSITION_MESSAGE_PREFIX,
  REMOVED_POSITION_MESSAGE,
  hasPosition,
  stripPositions,
} from './redaction';

const DAY_MS = 24 * 60 * 60 * 1000;
// Retention periods (nLPD / GDPR: keep personal data no longer than
// needed) — Sylvie's call, 2026-11-06. See plan.txt DATA PROTECTION.
export const POSITION_RETENTION_DAYS = 30; // after the alert is resolved / the watch ended
export const NOTIFICATION_RETENTION_DAYS = 182; // ~6 months
export const UNCLAIMED_STUB_RETENTION_DAYS = 182; // ~6 months
export const LOGIN_EVENT_RETENTION_DAYS = 90;

// A number known only because someone typed it in: no account behind it.
const STUB_WITHOUT_ACCOUNT = {
  status: UserStatus.ACTIVE,
  userType: UserType.ONLY_SMS,
  phoneVerifiedAt: null,
  passwordHash: null,
  email: null,
  googleId: null,
};

function erasedStubData(now: Date) {
  return {
    status: UserStatus.DELETED,
    deletedAt: now,
    firstName: DELETED_ACCOUNT_LABEL,
    phone: null,
    otpCodeHash: null,
    otpExpiresAt: null,
  };
}

// Daily purge of personal data kept past its use. Idempotent: each run
// only touches what is still there to erase.
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(now = new Date()) {
    const positions = await this.purgePositions(now);
    const watchPositions = await this.purgeWatchPositions(now);
    const notifications = await this.purgeNotifications(now);
    const stubs = await this.purgeUnclaimedStubs(now);
    const logins = await this.purgeLoginEvents(now);
    this.logger.log(
      `Retention purge: ${positions} alert(s) without position, ${watchPositions} watch step(s) without position, ${notifications} notification(s), ${stubs} unclaimed number(s), ${logins} sign-in(s)`,
    );
  }

  // The sign-in journal is for spotting an intruder, not an archive.
  async purgeLoginEvents(now: Date): Promise<number> {
    const before = new Date(
      now.getTime() - LOGIN_EVENT_RETENTION_DAYS * DAY_MS,
    );
    const { count } = await this.prisma.loginEvent.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  // GPS positions only help while the person is being looked for.
  async purgePositions(now: Date): Promise<number> {
    const before = new Date(now.getTime() - POSITION_RETENTION_DAYS * DAY_MS);
    const resolved = {
      alertStatus: AlertStatus.RESOLVED,
      closedAt: { lt: before },
    };
    const alerts = await this.prisma.alert.findMany({
      where: { ...resolved, messageAlert: { contains: 'Position' } },
      select: { id: true, messageAlert: true },
    });
    const withPosition = alerts.filter((a) => hasPosition(a.messageAlert));
    await this.prisma.$transaction([
      ...withPosition.map((a) =>
        this.prisma.alert.update({
          where: { id: a.id },
          data: { messageAlert: stripPositions(a.messageAlert) },
        }),
      ),
      this.prisma.message.updateMany({
        where: {
          conversation: { alert: resolved },
          body: {
            startsWith: POSITION_MESSAGE_PREFIX,
            not: REMOVED_POSITION_MESSAGE,
          },
        },
        data: { body: REMOVED_POSITION_MESSAGE },
      }),
    ]);
    return withPosition.length;
  }

  // Watch Mode: the GPS position given when validating a step, kept the
  // same time after the watch ended — and never while an alert it opened
  // is still running.
  async purgeWatchPositions(now: Date): Promise<number> {
    const before = new Date(now.getTime() - POSITION_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.travelCheckpoint.updateMany({
      where: {
        alert: {
          alertStatus: AlertStatus.SENT,
          closedAt: { lt: before },
          tripAlerts: { none: { alertStatus: RUNNING_ALERT } },
        },
        OR: [
          { validatedLatitude: { not: null } },
          { validatedLongitude: { not: null } },
        ],
      },
      data: { validatedLatitude: null, validatedLongitude: null },
    });
    return count;
  }

  // Notifications are a passing inbox, not a record: deleted outright.
  async purgeNotifications(now: Date): Promise<number> {
    const before = new Date(
      now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS,
    );
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  // Right after a number says STOP or NON by SMS: if it has no account and
  // nothing left going on (no live link, no pending group invitation), its
  // number and the name the inviter typed are erased right away. The
  // links it declined or left stay, as history.
  async eraseStubIfUnused(phone: string, now = new Date()): Promise<boolean> {
    const stub = await this.prisma.user.findFirst({
      where: {
        phone,
        ...STUB_WITHOUT_ACCOUNT,
        linksAsSentinel: {
          none: {
            status: { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] },
          },
        },
        myUserSentinels: { none: {} },
        groupInvitationsReceived: {
          none: {
            status: { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] },
          },
        },
        sentMessages: { none: {} },
      },
      select: { id: true },
    });
    if (!stub) return false;
    await this.prisma.user.update({
      where: { id: stub.id },
      data: erasedStubData(now),
    });
    return true;
  }

  // A number someone typed in (an invitation, or a phone login never
  // finished) whose owner never said yes nor made an account: their
  // number and the name the inviter gave them go. The row stays, like
  // any deleted account (schema.prisma's core rule).
  async purgeUnclaimedStubs(now: Date): Promise<number> {
    const before = new Date(
      now.getTime() - UNCLAIMED_STUB_RETENTION_DAYS * DAY_MS,
    );
    const stubs = await this.prisma.user.findMany({
      where: {
        ...STUB_WITHOUT_ACCOUNT,
        createdAt: { lt: before },
        linksAsSentinel: {
          every: { status: { in: [LinkStatus.PENDING, LinkStatus.DECLINED] } },
        },
        myUserSentinels: { none: {} },
        groupInvitationsReceived: {
          every: { status: { in: [LinkStatus.PENDING, LinkStatus.DECLINED] } },
        },
        sentMessages: { none: {} },
      },
      select: { id: true },
    });
    const ids = stubs.map((s) => s.id);
    if (ids.length === 0) return 0;

    await this.prisma.$transaction([
      this.prisma.linkSentinels.updateMany({
        where: { userSentinelId: { in: ids }, status: LinkStatus.PENDING },
        data: { status: LinkStatus.REMOVED },
      }),
      this.prisma.sentinelGroupInvitation.updateMany({
        where: { invitedUserId: { in: ids }, status: LinkStatus.PENDING },
        data: { status: LinkStatus.REMOVED },
      }),
      this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: erasedStubData(now),
      }),
    ]);
    return ids.length;
  }
}
