import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AlertParticipantStatus,
  AlertStatus,
  AlertType,
  CircleStatus,
  CircleType,
  LinkStatus,
  MessagingMode,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';
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
import { UpdateAlertStatusDto } from './dto/update-alert-status.dto';
import { UpdateAlertLabelDto } from './dto/update-alert-label.dto';

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  BYCOMPANION: 'Appel a l’aide',
  LITTLEWORRY: 'Petite inquietude',
  MISSING: 'Personne introuvable',
  INCIDENT: 'Incident signale',
  EMERGENCY: 'Urgence',
  NOCONTACT: 'Sans nouvelles',
  UNKNOWN: 'Alerte',
};

const OUTER_CIRCLE_BATCH_SIZE = 2;
const OUTER_CIRCLE_STALE_HOURS = 4;
// Members without a manual callOrder sort after every manually-ordered one
// (assumed to stay well under this), in a stable-but-unpredictable order.
const RANDOM_CALL_ORDER_OFFSET = 1_000_000;

// Deterministic, not cryptographic — just needs to give the same "random"
// order every time the same alert+link pair is ranked.
function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

@Injectable()
export class AlertService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(REALTIME_NOTIFIER) private readonly notifier: RealtimeNotifier,
    private readonly notifications: NotificationService,
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
            requestedById: callerId,
            alertId: created.id,
            userSentinelsId: link.id,
          },
        });
      }

      // The 1st circle's own group chat, scoped to this alert — its
      // Sentinels only (not the companion, who's notified directly instead;
      // see plan.txt §4 "Messagerie Me <-> Sentinels"), and only those whose
      // link has canMessageOwnCircle — a Sentinel excluded this way still
      // gets an AlertParticipant row and the SMS notification above, just
      // not a seat in the live chat.
      await tx.conversation.create({
        data: {
          alertId: created.id,
          participants: {
            create: links
              .filter((link) => link.canMessageOwnCircle)
              .map((link) => ({ userId: link.linkAsSentinel.id })),
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

    await this.notifyAlertParticipants(alert.id, {
      type: NotificationType.ALERT_RAISED,
      actorId: callerId,
    });
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

    await this.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_CLOSED,
      actorId: callerId,
    });
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
        // Who last wrote statusByFirstCircle (statusByCompanion is always
        // the companion, no ambiguity there) / renamed the alert — "last
        // writer" only, not a full revision history (Sylvie's call).
        statusUpdatedBy: { select: { id: true, firstName: true } },
        labelUpdatedBy: { select: { id: true, firstName: true } },
        participants: {
          include: {
            userSentinels: {
              include: {
                linkAsSentinel: { select: { id: true, firstName: true } },
              },
            },
            // Who triggered contacting this Sentinel (raiseAlert's 1st-circle
            // fan-out, or requestCircle for an outer circle).
            requestedBy: { select: { id: true, firstName: true } },
          },
        },
        // So a client can find each conversation tied to this alert — the
        // main 1st-circle chat, plus one per outer-circle Sentinel who's
        // opened an isolated chat (getOrCreateCircleChat). `participants`
        // lets the caller tell them apart (any participant outside the
        // 1st circle marks it as an isolated chat, not the main one).
        // Messages are embedded here too so the companion (who isn't a
        // ConversationParticipant, by design) can still read the full
        // history as part of the alert detail, without being able to send.
        conversations: {
          select: {
            id: true,
            closedAt: true,
            participants: {
              select: { user: { select: { id: true, firstName: true } } },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                body: true,
                createdAt: true,
                sender: { select: { id: true, firstName: true } },
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

    // Members this circle already has an AlertParticipant row for (from a
    // previous request-circle call on this same alert) that's past WAITING
    // — i.e. already picked into an earlier batch. Only never-picked
    // members are eligible for this call's batch.
    const existing = await this.prisma.alertParticipant.findMany({
      where: { alertId, userSentinelsId: { in: links.map((l) => l.id) } },
      select: { userSentinelsId: true, status: true },
    });
    const alreadyContacted = new Set(
      existing
        .filter((p) => p.status !== AlertParticipantStatus.WAITING)
        .map((p) => p.userSentinelsId),
    );
    const batch = this.pickNextCircleBatch(alertId, links, alreadyContacted);
    if (batch.length === 0) {
      throw new BadRequestException(
        'Everyone in this circle has already been contacted',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const link of links) {
        await tx.alertParticipant.upsert({
          where: {
            alertId_userSentinelsId: { alertId, userSentinelsId: link.id },
          },
          // A repeat call must not reset a member who was already
          // contacted (or has answered) in an earlier batch back to
          // WAITING — only the frozen snapshot fields get refreshed here.
          update: {
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            canMessageOwnCircleAtAlert: link.canMessageOwnCircle,
            firstCircleMessagingModeAtAlert: link.firstCircleMessagingMode,
            isLead: link.leadSlot !== null,
            requestedById: callerId,
          },
          create: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            canMessageOwnCircleAtAlert: link.canMessageOwnCircle,
            firstCircleMessagingModeAtAlert: link.firstCircleMessagingMode,
            isLead: link.leadSlot !== null,
            requestedById: callerId,
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
      batch,
      alertCircleRequestSms(companion?.firstName ?? 'Un proche', dto.question),
    );

    await this.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_ESCALATED,
      actorId: callerId,
    });
    return this.getAlert(callerId, alertId);
  }

  // At most OUTER_CIRCLE_BATCH_SIZE members per call — ordered by manual
  // callOrder where set, otherwise a stable per-alert pseudo-random order
  // (same alert+link always ranks the same way, so repeat calls don't
  // reshuffle who's "next").
  private pickNextCircleBatch<
    T extends { id: string; callOrder: number | null },
  >(alertId: string, links: T[], alreadyContacted: Set<string>): T[] {
    const eligible = links.filter((l) => !alreadyContacted.has(l.id));
    const rank = (l: T) =>
      l.callOrder ??
      RANDOM_CALL_ORDER_OFFSET + stableHash(`${alertId}:${l.id}`);
    return [...eligible]
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, OUTER_CIRCLE_BATCH_SIZE);
  }

  // An account-holding outer-circle Sentinel, authorized via their
  // AlertParticipant's frozen firstCircleMessagingModeAtAlert (not NONE),
  // can request an isolated chat with the 1st circle during an active
  // alert — their own Conversation, not shared with any other requester.
  // Lazily created, like getOrCreateDirectConversation; re-requesting
  // just returns the existing one. Closes automatically with the alert,
  // same conversation.updateMany({ where: { alertId } }) as the main chat.
  async getOrCreateCircleChat(callerId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }

    const participant = await this.prisma.alertParticipant.findFirst({
      where: { alertId, userSentinels: { userSentinelId: callerId } },
    });
    if (!participant) {
      throw new ForbiddenException('You have no participation on this alert');
    }
    if (participant.circleId === alert.firstCircleId) {
      throw new ForbiddenException(
        'The 1st circle already has its own chat for this alert',
      );
    }
    if (
      !participant.firstCircleMessagingModeAtAlert ||
      participant.firstCircleMessagingModeAtAlert === MessagingMode.NONE
    ) {
      throw new ForbiddenException(
        'Not authorized to chat with the 1st circle',
      );
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        alertId,
        participants: { some: { userId: callerId, leftAt: null } },
      },
      select: { id: true, closedAt: true },
    });
    if (existing) return existing;

    const firstCircleRoster = await this.prisma.alertParticipant.findMany({
      where: { alertId, circleId: alert.firstCircleId },
      select: { userSentinels: { select: { userSentinelId: true } } },
    });

    return this.prisma.conversation.create({
      data: {
        alertId,
        participants: {
          create: [
            { userId: callerId },
            ...firstCircleRoster.map((p) => ({
              userId: p.userSentinels.userSentinelId,
            })),
          ],
        },
      },
      select: { id: true, closedAt: true },
    });
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

    const updated = await this.recordResponse(
      participant.id,
      dto.accepted ? 'OUI' : 'NON',
    );
    await this.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_RESPONSE,
      actorId: callerId,
    });
    return updated;
  }

  // Lightweight counterpart to getAlert(), for a participant of any circle
  // (not just the 1st) — e.g. an outer-circle Sentinel solicited via
  // requestCircle, who getAlert() itself deliberately doesn't let view the
  // full alert (participants roster, other circles, who-responded-what).
  // Just enough to make sense of and answer their own ask: the alert's
  // name, the raise reason, both sides' live status notes, who it's about,
  // and their own participation.
  async getMyParticipation(callerId: string, alertId: string) {
    const participant = await this.prisma.alertParticipant.findFirst({
      where: { alertId, userSentinels: { userSentinelId: callerId } },
      include: {
        alert: {
          select: {
            id: true,
            alertStatus: true,
            label: true,
            messageAlert: true,
            statusByCompanion: true,
            statusByFirstCircle: true,
            userCompanion: { select: { firstName: true } },
          },
        },
      },
      orderBy: { contactedAt: 'desc' },
    });
    if (!participant) {
      throw new ForbiddenException('You have no participation on this alert');
    }
    return participant;
  }

  // Two separate live status notes, one per side — not a single shared
  // field: the companion writes statusByCompanion, any accepted 1st-circle
  // Sentinel writes statusByFirstCircle (and stays attributed: unlike the
  // companion, who's always one person, several Sentinels could write this
  // side, so who last did is worth recording). Both visible to every
  // contacted Sentinel (any circle) via getAlert()/getMyParticipation().
  // Deliberately NOT gated on alertStatus: stays writable after the alert
  // is RESOLVED too, unlike the 1st-circle chat (locked once the
  // Conversation closes).
  async updateStatus(
    callerId: string,
    alertId: string,
    dto: UpdateAlertStatusDto,
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    if (callerId === alert.userCompanionId) {
      const updated = await this.prisma.alert.update({
        where: { id: alertId },
        data: { statusByCompanion: dto.message },
      });
      await this.notifyAlertParticipants(alertId);
      return updated;
    }

    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        userSentinelId: callerId,
        circleId: alert.firstCircleId,
        status: LinkStatus.ACCEPTED,
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'Not authorized to update this alert’s status',
      );
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        statusByFirstCircle: dto.message,
        statusUpdatedById: callerId,
        statusUpdatedAt: new Date(),
      },
    });
    await this.notifyAlertParticipants(alertId);
    return updated;
  }

  // Alert.label is the alert's name — any accepted 1st-circle Sentinel can
  // set it (not the companion, unlike updateStatus). Visible to every
  // contacted Sentinel, any circle, via getAlert()/getMyParticipation().
  async updateLabel(
    callerId: string,
    alertId: string,
    dto: UpdateAlertLabelDto,
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        userSentinelId: callerId,
        circleId: alert.firstCircleId,
        status: LinkStatus.ACCEPTED,
      },
    });
    if (!link) {
      throw new ForbiddenException('Only the 1st circle can rename this alert');
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        label: dto.label,
        labelUpdatedById: callerId,
        labelUpdatedAt: new Date(),
      },
    });
    await this.notifyAlertParticipants(alertId);
    return updated;
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
      include: { userSentinels: { select: { userSentinelId: true } } },
    });
    if (!participant) return null;

    await this.recordResponse(participant.id, body.trim());
    await this.sms.send(phone, alertReplyAckSms());
    await this.notifyAlertParticipants(participant.alertId, {
      type: NotificationType.ALERT_RESPONSE,
      actorId: participant.userSentinels.userSentinelId,
    });

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

  // Pushes a live "this alert changed" ping to the companion and every
  // Sentinel ever contacted on it (any circle) — whoever might have the
  // alert open. The socket payload is just the alertId; clients refetch
  // over the existing REST endpoints, so this never has to duplicate
  // getAlert()'s authorization logic.
  // `notify`, when passed, also persists a Notification for every recipient
  // except the actor — only for the four event buckets worth a line in the
  // inbox (raise/escalate/respond/close). updateStatus/updateLabel's free-
  // text edits deliberately omit it: broadcasting those to the entire
  // historical participant roster on every minor note change would be noise.
  private async notifyAlertParticipants(
    alertId: string,
    notify?: { type: NotificationType; actorId: string },
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: {
        userCompanionId: true,
        participants: {
          select: { userSentinels: { select: { userSentinelId: true } } },
        },
      },
    });
    if (!alert) return;
    this.notifier.notifyAlertChanged(alert.userCompanionId, alertId);
    for (const p of alert.participants) {
      this.notifier.notifyAlertChanged(p.userSentinels.userSentinelId, alertId);
    }
    if (!notify) return;
    const recipients = [
      alert.userCompanionId,
      ...alert.participants.map((p) => p.userSentinels.userSentinelId),
    ];
    for (const userId of recipients) {
      if (userId === notify.actorId) continue;
      await this.notifications.create({
        userId,
        type: notify.type,
        actorUserId: notify.actorId,
        targetId: alertId,
      });
    }
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

  // Never auto-contacts anyone — just a one-time nudge to the 1st circle +
  // companion that a batch has gone quiet, so they can decide (via the
  // normal request-circle action) whether to try more people.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async remindStaleCircleBatches() {
    const staleThreshold = new Date(
      Date.now() - OUTER_CIRCLE_STALE_HOURS * 60 * 60 * 1000,
    );
    const stale = await this.prisma.alertParticipant.findMany({
      where: {
        status: AlertParticipantStatus.CONTACTED,
        contactedAt: { lt: staleThreshold },
        alert: { alertStatus: { not: AlertStatus.RESOLVED } },
      },
      select: {
        alertId: true,
        circleId: true,
        contactedAt: true,
        alert: { select: { firstCircleId: true, userCompanionId: true } },
      },
    });

    interface StaleBatch {
      alertId: string;
      circleId: string;
      contactedAt: Date;
      userCompanionId: string;
      firstCircleId: string;
    }
    // One reminder per stale alert+circle batch — the 1st circle is never
    // batched, so it's excluded. Keep the earliest contactedAt as "when
    // this batch started waiting", used below to dedupe the reminder.
    const batches = new Map<string, StaleBatch>();
    for (const p of stale) {
      if (!p.contactedAt || p.circleId === p.alert.firstCircleId) continue;
      const key = `${p.alertId}:${p.circleId}`;
      const current = batches.get(key);
      if (!current || p.contactedAt < current.contactedAt) {
        batches.set(key, {
          alertId: p.alertId,
          circleId: p.circleId,
          contactedAt: p.contactedAt,
          userCompanionId: p.alert.userCompanionId,
          firstCircleId: p.alert.firstCircleId,
        });
      }
    }

    for (const batch of batches.values()) {
      const stillSomeoneLeft = await this.prisma.alertParticipant.count({
        where: {
          alertId: batch.alertId,
          circleId: batch.circleId,
          status: AlertParticipantStatus.WAITING,
        },
      });
      if (stillSomeoneLeft === 0) continue;

      const alreadyReminded = await this.prisma.notification.count({
        where: {
          type: NotificationType.ALERT_CIRCLE_NO_RESPONSE,
          targetId: batch.alertId,
          createdAt: { gt: batch.contactedAt },
        },
      });
      if (alreadyReminded > 0) continue;

      const firstCircleMembers = await this.prisma.linkSentinels.findMany({
        where: { circleId: batch.firstCircleId, status: LinkStatus.ACCEPTED },
        select: { userSentinelId: true },
      });
      const recipients = [
        batch.userCompanionId,
        ...firstCircleMembers.map((l) => l.userSentinelId),
      ];
      for (const userId of recipients) {
        await this.notifications.create({
          userId,
          type: NotificationType.ALERT_CIRCLE_NO_RESPONSE,
          targetId: batch.alertId,
        });
      }
    }
  }
}
