import {
  BadRequestException,
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
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import {
  alertCircleRequestSms,
  alertClosedSms,
  alertClosedToCompanionSms,
  alertRaisedSms,
  alertRaisedToCompanionSms,
  alertReplyAckSms,
  parseSmsReply,
} from '../sms/messages';
import { CreateAlertDto } from './dto/create-alert.dto';
import { RequestCircleDto } from './dto/request-circle.dto';
import { RespondAlertDto } from './dto/respond-alert.dto';

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

    // Per plan.txt, the 1st circle must always keep >=1 Lead Sentinel —
    // without one, nobody would actually be in charge to drive the alert,
    // so raising isn't allowed yet. Covers both "no 1st circle at all"
    // (trivially no lead) and "1st circle exists but no accepted lead".
    const links = circle
      ? await this.prisma.linkSentinels.findMany({
          where: { circleId: circle.id, status: LinkStatus.ACCEPTED },
          include: {
            linkAsSentinel: {
              select: { id: true, firstName: true, phone: true },
            },
          },
        })
      : [];
    if (!circle || !links.some((link) => link.leadSlot !== null)) {
      throw new ConflictException(
        'This companion’s 1st circle has no Lead Sentinel yet — an alert can’t be raised',
      );
    }

    await this.assertCanRaise(callerId, dto.companionId);

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
            isLead: link.leadSlot !== null,
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
      alertRaisedSms(companion?.firstName ?? 'Un proche', dto.reason),
    );

    if (callerId !== dto.companionId && companion?.phone) {
      // The raiser may be any Sentinel (not necessarily 1st-circle), so
      // they're not necessarily among `links` — look their name up directly.
      const raiser = await this.prisma.user.findUnique({
        where: { id: callerId },
        select: { firstName: true },
      });
      await this.sms.send(
        companion.phone,
        alertRaisedToCompanionSms(raiser?.firstName ?? 'Un Sentinel'),
      );
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
        userCompanion: {
          select: {
            id: true,
            firstName: true,
            // So the companion or 1st circle can pick a target for
            // requestCircle without a separate lookup (listCircles() only
            // works for the companion themself, not a Sentinel caller).
            myCircles: {
              where: {
                circleType: CircleType.BASIC,
                status: CircleStatus.ACTIVE,
              },
              select: { id: true, label: true },
            },
          },
        },
        participants: {
          include: {
            userSentinels: {
              include: {
                linkAsSentinel: { select: { id: true, firstName: true } },
              },
            },
          },
        },
        // So a client can find the 1st-circle chat's conversationId to call
        // the `messaging` endpoints — the only conversation created so far.
        conversations: { select: { id: true, closedAt: true } },
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

  // 1st circle (or "Me") targets one specific outer circle with a yes/no
  // question during an active alert — see plan.txt's escalation model.
  // Re-requesting the same circle (e.g. no one answered) just resets its
  // participants to WAITING rather than erroring, via upsert on the real
  // @@unique([alertId, userSentinelsId]) constraint.
  async requestCircle(
    callerId: string,
    alertId: string,
    dto: RequestCircleDto,
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
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

    const circle = await this.prisma.circle.findFirst({
      where: {
        id: dto.circleId,
        userCompanionId: alert.userCompanionId,
        circleType: CircleType.BASIC,
        status: CircleStatus.ACTIVE,
      },
    });
    if (!circle) {
      throw new BadRequestException(
        'Not a valid outer circle for this companion',
      );
    }

    const links = await this.prisma.linkSentinels.findMany({
      where: { circleId: circle.id, status: LinkStatus.ACCEPTED },
      include: {
        linkAsSentinel: { select: { id: true, phone: true } },
      },
    });
    if (links.length === 0) {
      throw new BadRequestException('This circle has no Sentinel to ask');
    }

    const companion = await this.prisma.user.findUnique({
      where: { id: alert.userCompanionId },
      select: { firstName: true },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const link of links) {
        await tx.alertParticipant.upsert({
          where: {
            alertId_userSentinelsId: { alertId, userSentinelsId: link.id },
          },
          update: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            canMessageOwnCircleAtAlert: link.canMessageOwnCircle,
            firstCircleMessagingModeAtAlert: link.firstCircleMessagingMode,
            isLead: link.leadSlot !== null,
            answeredAt: null,
            response: null,
          },
          create: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            canMessageOwnCircleAtAlert: link.canMessageOwnCircle,
            firstCircleMessagingModeAtAlert: link.firstCircleMessagingMode,
            isLead: link.leadSlot !== null,
            alertId,
            userSentinelsId: link.id,
          },
        });
      }

      // First real use of the ACTIVE/activatedAt lifecycle stage — an
      // escalation means the 1st circle is actively working the alert.
      if (alert.alertStatus === AlertStatus.LAUNCHED) {
        await tx.alert.update({
          where: { id: alertId },
          data: { alertStatus: AlertStatus.ACTIVE, activatedAt: new Date() },
        });
      }
    });

    await this.notifyParticipants(
      alertId,
      links,
      alertCircleRequestSms(companion?.firstName ?? 'Un proche', dto.question),
    );

    return this.getAlert(callerId, alertId);
  }

  // In-app alternative to an SMS OUI/NON reply, for any account-holding
  // Sentinel (any circle) who's been asked and is still awaiting an answer.
  // Returns the updated participant row, not the full getAlert() detail —
  // the caller here may be an outer-circle Sentinel, who getAlert() itself
  // deliberately doesn't let view the alert (only "Me" or the 1st circle do).
  async respond(callerId: string, alertId: string, dto: RespondAlertDto) {
    const participant = await this.prisma.alertParticipant.findFirst({
      where: {
        alertId,
        status: AlertParticipantStatus.CONTACTED,
        userSentinels: { userSentinelId: callerId },
      },
    });
    if (!participant) {
      throw new ForbiddenException('No pending request for you on this alert');
    }

    return this.recordResponse(participant.id, dto.accepted ? 'OUI' : 'NON');
  }

  // SMS webhook fallback, called by SentinelService.handleInboundSms once its
  // own sentinel-link-domain checks (pending invite/request, circle-move
  // proposal) have found no match, but *before* its blanket "NON means leave"
  // fallback — a live alert ask is a more specific, time-boxed match. Returns
  // null (not a "no match" object) so the caller can fall through cleanly.
  async tryHandleInboundSms(phone: string, body: string) {
    const intent = parseSmsReply(body);
    if (intent === 'unknown') return null;

    const participant = await this.prisma.alertParticipant.findFirst({
      where: {
        status: AlertParticipantStatus.CONTACTED,
        userSentinels: { linkAsSentinel: { phone } },
        alert: { alertStatus: { not: AlertStatus.RESOLVED } },
      },
      orderBy: { contactedAt: 'desc' },
    });
    if (!participant) return null;

    await this.recordResponse(participant.id, body.trim());
    await this.sms.send(phone, alertReplyAckSms());

    return {
      matched: true as const,
      action: intent === 'accept' ? 'alert_confirmed' : 'alert_declined',
    };
  }

  private recordResponse(participantId: string, rawText: string) {
    return this.prisma.alertParticipant.update({
      where: { id: participantId },
      data: {
        status: AlertParticipantStatus.RESPONDED,
        response: rawText,
        answeredAt: new Date(),
      },
    });
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

  // raiseAlert only: "Me", or ANY of their accepted Sentinels, any circle —
  // per plan.txt, an outer-circle Sentinel's only alert power is to raise
  // the initial alert, which always notifies the 1st circle regardless of
  // which circle the raiser is actually in.
  private async assertCanRaise(callerId: string, companionId: string) {
    if (callerId === companionId) return;
    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        userSentinelId: callerId,
        userCompanionId: companionId,
        status: LinkStatus.ACCEPTED,
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'Not authorized to raise an alert for this companion',
      );
    }
  }

  // closeAlert/getAlert only: "Me" or an accepted 1st-circle Sentinel —
  // only the 1st circle (or "Me") ever manages or closes an alert.
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
    text: string,
  ) {
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
