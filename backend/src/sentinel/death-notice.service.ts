import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CircleStatus,
  CircleType,
  LinkStatus,
  NotificationType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import { deathNoticeSms } from '../sms/messages';
import { getUserOrThrow, userLabel } from './sentinel-helpers';

// ---- Death notice (report / confirm / reject) ------------------------------
//
// A permanent state, deliberately outside the Alert model — Alert is a
// resolvable, time-boxed emergency, a death never "resolves." No new
// tables either: the report/confirm flow and announcement text are flat
// fields on User (like Alert's own launchedAt/closedAt), and recipient
// opt-in + personal message are flat fields on LinkSentinels (alongside
// canSendPhone) — a literal "memorial circle" doesn't work
// since a Sentinel/Companion pair has only one LinkSentinels row ever.
@Injectable()
export class DeathNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly notifications: NotificationService,
  ) {}

  // Who could serve as the SECOND confirmer for `circleId`'s pending report,
  // excluding the original reporter: every other Lead, or — only when that
  // circle currently has exactly one Lead at all — any other accepted
  // Sentinel of it. Shared by the fan-out on report and the eligibility
  // check on confirm/reject.
  private async getEligibleConfirmerIds(
    circleId: string,
    reportedById: string,
  ): Promise<string[]> {
    const leads = await this.prisma.linkSentinels.findMany({
      where: {
        circleId,
        status: LinkStatus.ACCEPTED,
        leadSlot: { not: null },
      },
      select: { userSentinelId: true },
    });
    const otherLeadIds = leads
      .map((l) => l.userSentinelId)
      .filter((id) => id !== reportedById);
    if (leads.length > 1) return otherLeadIds;

    const others = await this.prisma.linkSentinels.findMany({
      where: {
        circleId,
        status: LinkStatus.ACCEPTED,
        userSentinelId: { not: reportedById },
      },
      select: { userSentinelId: true },
    });
    return others.map((l) => l.userSentinelId);
  }

  private async assertCanSecondConfirm(
    circleId: string,
    callerId: string,
    reportedById: string,
  ) {
    if (callerId === reportedById) {
      throw new ForbiddenException(
        'The reporter cannot confirm or reject their own report',
      );
    }
    const eligible = await this.getEligibleConfirmerIds(circleId, reportedById);
    if (!eligible.includes(callerId)) {
      throw new ForbiddenException(
        'Not authorized to confirm or reject this death report',
      );
    }
  }

  // The companion's active 1st circle, or null — death-notice report/
  // confirm/reject all key off it, same as raiseAlert's own Lead check.
  private async findFirstCircle(companionId: string) {
    return this.prisma.circle.findFirst({
      where: {
        userCompanionId: companionId,
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
      },
    });
  }

  async reportDeath(callerId: string, companionId: string) {
    const companion = await getUserOrThrow(this.prisma, companionId);
    if (companion.status === UserStatus.DECEASED) {
      throw new ConflictException('This companion is already deceased');
    }
    if (companion.deathReportedAt) {
      throw new ConflictException(
        'A death report is already pending for this companion',
      );
    }

    const circle = await this.findFirstCircle(companionId);
    const callerLink = circle
      ? await this.prisma.linkSentinels.findFirst({
          where: {
            circleId: circle.id,
            userSentinelId: callerId,
            status: LinkStatus.ACCEPTED,
            leadSlot: { not: null },
          },
        })
      : null;
    if (!circle || !callerLink) {
      throw new ForbiddenException(
        'Only a Lead Sentinel of this companion’s 1st circle can report a death',
      );
    }

    await this.prisma.user.update({
      where: { id: companionId },
      data: { deathReportedAt: new Date(), deathReportedById: callerId },
    });

    const reporter = await getUserOrThrow(this.prisma, callerId);
    const confirmerIds = await this.getEligibleConfirmerIds(
      circle.id,
      callerId,
    );
    for (const confirmerId of confirmerIds) {
      await this.notifications.create({
        userId: confirmerId,
        type: NotificationType.DEATH_NOTICE_REPORTED,
        actorUserId: callerId,
        actorLabel: userLabel(reporter),
        targetId: companionId,
      });
    }
    return { reported: true };
  }

  // Confirming or rejecting: a report must be pending, and the caller must be
  // allowed to be its second voice. Returns who reported it.
  private async pendingReportToAnswer(callerId: string, companionId: string) {
    const companion = await getUserOrThrow(this.prisma, companionId);
    if (!companion.deathReportedAt || !companion.deathReportedById) {
      throw new ConflictException('No pending death report for this companion');
    }
    const circle = await this.findFirstCircle(companionId);
    if (!circle) throw new NotFoundException('1st circle not found');
    await this.assertCanSecondConfirm(
      circle.id,
      callerId,
      companion.deathReportedById,
    );
    return companion.deathReportedById;
  }

  async confirmDeath(callerId: string, companionId: string) {
    await this.pendingReportToAnswer(callerId, companionId);

    await this.prisma.user.update({
      where: { id: companionId },
      data: {
        status: UserStatus.DECEASED,
        deceasedAt: new Date(),
        deathConfirmedById: callerId,
      },
    });

    await this.fanOutDeathAnnouncement(companionId);
    return { confirmed: true };
  }

  async rejectDeathReport(callerId: string, companionId: string) {
    const deathReportedById = await this.pendingReportToAnswer(
      callerId,
      companionId,
    );
    await this.prisma.user.update({
      where: { id: companionId },
      data: { deathReportedAt: null, deathReportedById: null },
    });

    await this.notifications.create({
      userId: deathReportedById,
      type: NotificationType.DEATH_NOTICE_REJECTED,
      actorUserId: callerId,
      targetId: companionId,
    });
    return { rejected: true };
  }

  // Best-effort fan-out to every opted-in, still-accepted recipient. The SMS
  // only asks them to log in: the name and announcement wait behind it, read
  // through getDeathNoticeAnnouncement. Mirrors AlertService's
  // notifyParticipants (Promise.allSettled, don't block on delivery).
  private async fanOutDeathAnnouncement(companionId: string) {
    const recipients = await this.prisma.linkSentinels.findMany({
      where: {
        userCompanionId: companionId,
        status: LinkStatus.ACCEPTED,
        notifyOnDeath: true,
      },
      include: {
        linkAsSentinel: { select: { id: true, phone: true } },
      },
    });
    if (recipients.length === 0) return;

    await Promise.allSettled(
      recipients
        .filter((r) => r.linkAsSentinel.phone)
        .map((r) =>
          this.sms.send(r.linkAsSentinel.phone as string, deathNoticeSms()),
        ),
    );
    for (const r of recipients) {
      await this.notifications.create({
        userId: r.linkAsSentinel.id,
        type: NotificationType.DEATH_NOTICE_CONFIRMED,
        targetId: companionId,
      });
    }
    await this.prisma.linkSentinels.updateMany({
      where: { id: { in: recipients.map((r) => r.id) } },
      data: { deathNotifiedAt: new Date() },
    });
  }

  // Recipient-facing read: only someone this companion actually notified
  // (opted-in link, fan-out already happened) can see the announcement.
  async getDeathNoticeAnnouncement(callerId: string, companionId: string) {
    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        userSentinelId: callerId,
        userCompanionId: companionId,
        notifyOnDeath: true,
        deathNotifiedAt: { not: null },
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'You were not notified of this announcement',
      );
    }
    const companion = await this.prisma.user.findUnique({
      where: { id: companionId },
      select: { deathAnnouncementMessage: true },
    });
    return {
      announcementMessage: companion?.deathAnnouncementMessage ?? '',
      personalMessage: link.deathPersonalMessage,
    };
  }

  // Every announcement sent to me: the only place someone without an account
  // can read one.
  async listMyDeathNotices(userId: string) {
    const links = await this.prisma.linkSentinels.findMany({
      where: {
        userSentinelId: userId,
        notifyOnDeath: true,
        deathNotifiedAt: { not: null },
      },
      include: {
        userCompanion: {
          select: {
            firstName: true,
            lastName: true,
            deathAnnouncementMessage: true,
          },
        },
      },
      orderBy: { deathNotifiedAt: 'desc' },
    });
    return links.map(({ userCompanion, deathPersonalMessage }) => ({
      companionName: [userCompanion.firstName, userCompanion.lastName]
        .filter(Boolean)
        .join(' '),
      announcementMessage: userCompanion.deathAnnouncementMessage ?? '',
      personalMessage: deathPersonalMessage,
    }));
  }
}
