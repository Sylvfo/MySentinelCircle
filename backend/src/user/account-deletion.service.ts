import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AlertParticipantStatus,
  AlertStatus,
  CircleStatus,
  CircleType,
  LinkStatus,
  MessageType,
  NotificationType,
  UserStatus,
} from '@prisma/client';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { GroupService } from '../sentinel/group.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { lastLeadLeftSms, sentinelLeaveConfirmSms } from '../sms/messages';
import { AVATAR_DIR, UserService } from './user.service';
import {
  POSITION_MESSAGE_PREFIX,
  REMOVED_PHOTO_TEXT,
  REMOVED_POSITION_MESSAGE,
  hasPosition,
  stripPositions,
} from '../privacy/redaction';
import { MESSAGE_IMAGE_DIR } from '../messaging/messaging.controller';

import { DELETED_ACCOUNT_LABEL } from './user-status.util';
import { smsLang } from '../sms/messages';
export { DELETED_ACCOUNT_LABEL };

// Matched by the frontend's DeleteAccountPanel to show a translated message.
export const OWN_ALERT_IN_PROGRESS =
  'An alert about you is in progress: your account can be deleted once it is over';
export const LEAD_ON_ALERT_IN_PROGRESS =
  'You are a Lead on an alert in progress: leave it before deleting your account';

const ACTIVE_LINK_STATUSES = [LinkStatus.PENDING, LinkStatus.ACCEPTED];

// A deleted account is never removed (schema.prisma's core rule): its row
// stays so alert history and messages keep resolving, with everything that
// identifies the person wiped. Immediate and final.
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly groups: GroupService,
    private readonly notifications: NotificationService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
  ) {}

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found');
    this.users.assertStepUpFresh(user);
    if (user.status === UserStatus.DECEASED) {
      throw new ForbiddenException('This account is deceased');
    }
    await this.assertNoActiveAlert(userId);
    await this.leaveGroups(userId);

    const notices = await this.collectNotices(userId);
    const photos = await this.eraseIdentifyingContent(userId);
    await this.anonymize(userId);
    for (const file of photos) {
      await unlink(join(MESSAGE_IMAGE_DIR, file)).catch(() => {});
    }

    if (user.avatarPath) {
      await unlink(join(AVATAR_DIR, user.avatarPath)).catch(() => {});
    }
    await this.send(notices);
    this.realtime.disconnectUser(userId);
    return { message: 'Account deleted' };
  }

  // Leaving mid-alert could strand the person it concerns. Their own alert
  // must be over; a Lead must first leave the alert (AlertService.leaveAlert,
  // which needs another Lead to take over). Never nudge anyone to close an
  // alert just to delete an account.
  private async assertNoActiveAlert(userId: string) {
    const activeAlert = await this.prisma.alert.findFirst({
      where: {
        userCompanionId: userId,
        alertStatus: { not: AlertStatus.RESOLVED },
      },
    });
    if (activeAlert) {
      throw new ConflictException(OWN_ALERT_IN_PROGRESS);
    }
    const activeLead = await this.prisma.alertParticipant.findFirst({
      where: {
        isLead: true,
        status: { not: AlertParticipantStatus.CLOSED },
        alert: { alertStatus: { not: AlertStatus.RESOLVED } },
        userSentinels: { userSentinelId: userId },
      },
    });
    if (activeLead) {
      throw new ConflictException(LEAD_ON_ALERT_IN_PROGRESS);
    }
  }

  private async leaveGroups(userId: string) {
    const groupCircles = await this.prisma.circle.findMany({
      where: {
        userCompanionId: userId,
        circleType: CircleType.GROUP,
        status: CircleStatus.ACTIVE,
      },
    });
    for (const circle of groupCircles) {
      if (circle.groupRootId) {
        await this.groups.leaveGroup(userId, circle.groupRootId);
      } else {
        await this.groups.deleteGroup(userId, circle.id);
      }
    }
  }

  // Read before anonymizing: names and numbers are gone afterwards.
  private async collectNotices(userId: string) {
    const parties = {
      select: { firstName: true, phone: true, language: true },
    };
    const asSentinel = await this.prisma.linkSentinels.findMany({
      where: { userSentinelId: userId, status: LinkStatus.ACCEPTED },
      include: { linkAsSentinel: parties, userCompanion: parties },
    });
    const asCompanion = await this.prisma.linkSentinels.findMany({
      where: { userCompanionId: userId, status: LinkStatus.ACCEPTED },
      include: { linkAsSentinel: parties, userCompanion: parties },
    });

    const lastLeadCompanions = new Set<string>();
    for (const link of asSentinel) {
      if (link.leadSlot === null) continue;
      const otherLeads = await this.prisma.linkSentinels.count({
        where: {
          circleId: link.circleId,
          status: LinkStatus.ACCEPTED,
          leadSlot: { not: null },
          id: { not: link.id },
        },
      });
      if (otherLeads === 0) lastLeadCompanions.add(link.userCompanionId);
    }
    return { asSentinel, asCompanion, lastLeadCompanions };
  }

  // History stays readable (messages and alerts keep their text, signed
  // "Compte supprimé"), but what pinpoints the person goes: their shared
  // GPS positions, their photos, their personal death messages. Returns
  // the photo files to unlink once the database is updated.
  private async eraseIdentifyingContent(userId: string): Promise<string[]> {
    const alerts = await this.prisma.alert.findMany({
      where: { userCompanionId: userId },
      select: { id: true, messageAlert: true },
    });
    const alertUpdates = alerts
      .filter((a) => hasPosition(a.messageAlert))
      .map((a) =>
        this.prisma.alert.update({
          where: { id: a.id },
          data: {
            messageAlert: stripPositions(a.messageAlert),
          },
        }),
      );

    const photos = await this.prisma.message.findMany({
      where: { senderId: userId, type: MessageType.IMAGE },
      select: { body: true },
    });

    await this.prisma.$transaction([
      ...alertUpdates,
      this.prisma.message.updateMany({
        where: {
          senderId: userId,
          type: MessageType.TEXT,
          body: { startsWith: POSITION_MESSAGE_PREFIX },
        },
        data: { body: REMOVED_POSITION_MESSAGE },
      }),
      this.prisma.message.updateMany({
        where: { senderId: userId, type: MessageType.IMAGE },
        data: { type: MessageType.TEXT, body: REMOVED_PHOTO_TEXT },
      }),
      this.prisma.linkSentinels.updateMany({
        where: { userCompanionId: userId },
        data: { deathPersonalMessage: null, notifyOnDeath: false },
      }),
    ]);
    // basename: only ever a file inside the messages folder.
    return photos.map((p) => basename(p.body));
  }

  private async anonymize(userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.linkSentinels.updateMany({
        where: {
          status: { in: ACTIVE_LINK_STATUSES },
          OR: [{ userSentinelId: userId }, { userCompanionId: userId }],
        },
        data: {
          status: LinkStatus.REMOVED,
          leadSlot: null,
          proposedCircleId: null,
        },
      }),
      this.prisma.circle.updateMany({
        where: { userCompanionId: userId, status: CircleStatus.ACTIVE },
        data: { status: CircleStatus.CLOSED, closedAt: now },
      }),
      this.prisma.notification.updateMany({
        where: { actorUserId: userId },
        data: { actorLabel: DELETED_ACCOUNT_LABEL },
      }),
      // Where and when they signed in: nothing to keep once they're gone.
      this.prisma.loginEvent.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.DELETED,
          deletedAt: now,
          firstName: DELETED_ACCOUNT_LABEL,
          lastName: null,
          userName: null,
          email: null,
          phone: null,
          phoneVerifiedAt: null,
          pendingPhone: null,
          passwordHash: null,
          googleId: null,
          avatarPath: null,
          publicStatus: null,
          stepUpVerifiedAt: null,
          pendingEmail: null,
          pendingEmailTokenHash: null,
          pendingEmailExpiresAt: null,
          otpCodeHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          loginAttempts: 0,
          loginLockedUntil: null,
          deathAnnouncementMessage: null,
          gender: null,
        },
      }),
    ]);
  }

  // Best-effort: the account is already gone, a failed SMS must not undo
  // that or hide it from the person deleting it.
  private async send({
    asSentinel,
    asCompanion,
    lastLeadCompanions,
  }: Awaited<ReturnType<AccountDeletionService['collectNotices']>>) {
    const sends: Promise<unknown>[] = [];
    const smsTo = (phone: string | null, body: string) => {
      if (phone) sends.push(this.sms.send(phone, body));
    };

    for (const link of asSentinel) {
      const { firstName } = link.linkAsSentinel;
      sends.push(
        this.notifications.create({
          userId: link.userCompanionId,
          type: NotificationType.SENTINEL_LEFT,
          actorLabel: firstName,
          targetId: link.id,
        }),
      );
      if (lastLeadCompanions.has(link.userCompanionId)) {
        smsTo(
          link.userCompanion.phone,
          lastLeadLeftSms(smsLang(link.userCompanion.language)),
        );
        sends.push(
          this.notifications.create({
            userId: link.userCompanionId,
            type: NotificationType.SENTINEL_LINK_ANSWERED,
            actorLabel: DELETED_ACCOUNT_LABEL,
            accepted: false,
            targetId: link.id,
          }),
        );
      }
    }
    for (const link of asCompanion) {
      smsTo(
        link.linkAsSentinel.phone,
        sentinelLeaveConfirmSms(
          link.userCompanion.firstName,
          smsLang(link.linkAsSentinel.language),
        ),
      );
    }

    const results = await Promise.allSettled(sends);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Deletion notice failed: ${String(result.reason)}`);
      }
    }
  }
}
