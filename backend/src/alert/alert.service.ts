import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertParticipantStatus,
  AlertStatus,
  AlertType,
  CircleStatus,
  CircleType,
  LinkStatus,
  SentinelType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import {
  alertClosedSms,
  alertClosedToCompanionSms,
  alertRaisedSms,
  alertRaisedToCompanionSms,
} from '../sms/messages';
import { CreateAlertDto } from './dto/create-alert.dto';

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  BYCOMPANION: 'Appel a l’aide',
  LITTLEWORRY: 'Petite inquietude',
  MISSING: 'Personne introuvable',
  INCIDENT: 'Incident signale',
  EMERGENCY: 'Urgence',
  NOCONTACT: 'Sans nouvelles',
  UNKNOWN: 'Alerte',
};

@Injectable()
export class AlertService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async raiseAlert(callerId: string, dto: CreateAlertDto) {
    await this.assertNoActiveAlert(dto.companionId);

    const circle = await this.prisma.circle.findFirst({
      where: {
        userCompanionId: dto.companionId,
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
      },
    });
    if (!circle) throw new NotFoundException('1st circle not found');

    await this.assertIsCompanionOrFirstCircleMember(
      callerId,
      dto.companionId,
      circle.id,
    );

    const links = await this.prisma.linkSentinels.findMany({
      where: { circleId: circle.id, status: LinkStatus.ACCEPTED },
      include: {
        linkAsSentinel: { select: { id: true, firstName: true, phone: true } },
      },
    });
    const companion = await this.prisma.user.findUnique({
      where: { id: dto.companionId },
      select: { firstName: true, phone: true },
    });

    const alert = await this.prisma.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          label: ALERT_TYPE_LABELS[dto.alertType],
          messageAlert: dto.reason,
          alertStatus: AlertStatus.LAUNCHED,
          alertType: dto.alertType,
          launchedAt: new Date(),
          launchedById: callerId,
          userCompanionId: dto.companionId,
          firstCircleId: circle.id,
        },
      });

      for (const link of links) {
        await tx.alertParticipant.create({
          data: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            canMessageOwnCircleAtAlert: link.canMessageOwnCircle,
            firstCircleMessagingModeAtAlert: link.firstCircleMessagingMode,
            isLead: link.sentinelType === SentinelType.LEAD,
            alertId: created.id,
            userSentinelsId: link.id,
          },
        });
      }

      // The 1st circle's own group chat, scoped to this alert — its
      // Sentinels only (not the companion, who's notified directly instead;
      // see plan.txt §4 "Messagerie Me <-> Sentinels").
      await tx.conversation.create({
        data: {
          alertId: created.id,
          participants: {
            create: links.map((link) => ({ userId: link.linkAsSentinel.id })),
          },
        },
      });

      return created;
    });

    await this.notifyParticipants(
      alert.id,
      links,
      companion?.firstName ?? 'Un proche',
      dto.reason,
    );

    if (callerId !== dto.companionId) {
      const raiser = links.find((l) => l.linkAsSentinel.id === callerId);
      if (companion?.phone) {
        await this.sms.send(
          companion.phone,
          alertRaisedToCompanionSms(
            raiser?.linkAsSentinel.firstName ?? 'Un Sentinel',
          ),
        );
      }
    }

    return alert;
  }

  async closeAlert(callerId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        userCompanion: { select: { firstName: true, phone: true } },
        participants: {
          include: {
            userSentinels: {
              include: { linkAsSentinel: { select: { phone: true } } },
            },
          },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }

    await this.assertIsCompanionOrFirstCircleMember(
      callerId,
      alert.userCompanionId,
      alert.firstCircleId,
    );

    const now = new Date();
    const [updatedAlert] = await this.prisma.$transaction([
      this.prisma.alert.update({
        where: { id: alertId },
        data: {
          alertStatus: AlertStatus.RESOLVED,
          closedAt: now,
          closedById: callerId,
        },
      }),
      this.prisma.alertParticipant.updateMany({
        where: { alertId },
        data: { closedAt: now },
      }),
      this.prisma.conversation.updateMany({
        where: { alertId },
        data: { closedAt: now },
      }),
    ]);

    const text = alertClosedSms(alert.userCompanion.firstName);
    await Promise.allSettled(
      alert.participants
        .map((p) => p.userSentinels.linkAsSentinel.phone)
        .filter((phone): phone is string => !!phone)
        .map((phone) => this.sms.send(phone, text)),
    );

    if (callerId !== alert.userCompanionId && alert.userCompanion.phone) {
      await this.sms.send(
        alert.userCompanion.phone,
        alertClosedToCompanionSms(),
      );
    }

    return updatedAlert;
  }

  async getAlert(callerId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        participants: {
          include: {
            userSentinels: {
              include: {
                linkAsSentinel: { select: { id: true, firstName: true } },
              },
            },
          },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    await this.assertIsCompanionOrFirstCircleMember(
      callerId,
      alert.userCompanionId,
      alert.firstCircleId,
    );

    return alert;
  }

  listMyAlerts(callerId: string) {
    return this.prisma.alert.findMany({
      where: {
        OR: [
          { userCompanionId: callerId },
          {
            participants: {
              some: { userSentinels: { userSentinelId: callerId } },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Guards -----------------------------------------------------------

  private async assertNoActiveAlert(companionId: string) {
    const existing = await this.prisma.alert.findFirst({
      where: {
        userCompanionId: companionId,
        alertStatus: { not: AlertStatus.RESOLVED },
      },
    });
    if (existing) {
      throw new ConflictException(
        'An alert is already active for this companion',
      );
    }
  }

  // Shared by raiseAlert/closeAlert: "Me" or an accepted 1st-circle Sentinel.
  private async assertIsCompanionOrFirstCircleMember(
    callerId: string,
    companionId: string,
    firstCircleId: string,
  ) {
    if (callerId === companionId) return;
    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        userSentinelId: callerId,
        circleId: firstCircleId,
        status: LinkStatus.ACCEPTED,
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'Not authorized to act on this alert on the companion’s behalf',
      );
    }
  }

  // ---- Notifications ------------------------------------------------------

  private async notifyParticipants(
    alertId: string,
    links: { id: string; linkAsSentinel: { phone: string | null } }[],
    companionLabel: string,
    reason: string,
  ) {
    const text = alertRaisedSms(companionLabel, reason);
    await Promise.allSettled(
      links
        .filter((l) => l.linkAsSentinel.phone)
        .map((l) => this.sms.send(l.linkAsSentinel.phone as string, text)),
    );
    await this.prisma.alertParticipant.updateMany({
      where: { alertId, userSentinelsId: { in: links.map((l) => l.id) } },
      data: {
        status: AlertParticipantStatus.CONTACTED,
        contactedAt: new Date(),
      },
    });
  }
}
