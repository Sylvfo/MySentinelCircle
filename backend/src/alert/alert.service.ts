import { alertChatClosingDate } from '../common/conversation-closed';
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
  MessageType,
  NotificationType,
  UserType,
  LeadSlot,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';
import {
  alertClosedSms,
  alertClosedToCompanionSms,
  alertQuestionSms,
  alertRaisedSms,
  alertRaisedToCompanionSms,
  alertReplyAckSms,
  alertReplyHelpSms,
} from '../sms/messages';
import {
  FIRST_CIRCLE_REPLIES,
  parseAlertReply,
  parseAppReply,
  repliesFor,
} from './alert-replies';
import type { AlertQuestionKind } from './alert-replies';
import { AlertLocationDto, CreateAlertDto } from './dto/create-alert.dto';
import { AskQuestionDto } from './dto/ask-question.dto';
import { RequestCircleDto } from './dto/request-circle.dto';
import { RespondAlertDto } from './dto/respond-alert.dto';
import { UpdateAlertStatusDto } from './dto/update-alert-status.dto';
import { UpdateAlertLabelDto } from './dto/update-alert-label.dto';
import {
  NOT_PAUSED_SENTINEL,
  assertNotDeceased,
  assertNotPausedForMe,
} from '../user/user-status.util';
import {
  FREE_ALERT_TRIAL_LIMIT,
  FREE_TRIAL_USED_UP,
  PAYMENT_NOT_AVAILABLE,
  isSubscribed,
  paymentSimulated,
} from '../user/plan.util';

export const LEAD_CANNOT_PAUSE =
  'You are a Lead on an alert in progress — hand the lead over and leave that alert before pausing';

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  BYCOMPANION: 'Appel a l’aide',
  LITTLEWORRY: 'Petite inquietude',
  MISSING: 'Personne introuvable',
  INCIDENT: 'Incident signale',
  EMERGENCY: 'Urgence',
  NOCONTACT: 'Sans nouvelles',
  UNKNOWN: 'Alerte',
  TRAVEL: 'Alerte voyage',
};

const OPEN_QUESTION_INCLUDE = {
  alertParticipant: {
    include: {
      userSentinels: { select: { userSentinelId: true } },
      alert: { select: { userCompanion: { select: { firstName: true } } } },
    },
  },
} as const;

export type OpenAlertQuestion = Prisma.AlertQuestionGetPayload<{
  include: typeof OPEN_QUESTION_INCLUDE;
}>;

function companionFullName(
  companion: { firstName: string; lastName?: string | null } | null,
): string {
  if (!companion) return 'Une personne proche';
  return [companion.firstName, companion.lastName].filter(Boolean).join(' ');
}

function withReplyOptions<T extends { kind: string }>(question: T) {
  return {
    ...question,
    replyOptions: repliesFor(question.kind as AlertQuestionKind),
  };
}

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
    const incompleteCaller = await this.prisma.user.findFirst({
      where: { id: callerId, userType: UserType.ONLY_SMS },
    });
    if (incompleteCaller) {
      throw new ForbiddenException('Complete your profile first');
    }
    // A position comes from the phone of whoever raises the alert: their
    // own for an alert about themself, or — for an assistance alert raised
    // by someone who's with the person — where that someone is, said as
    // such. Never for a missing person: nobody knows where they are.
    const forSelf = callerId === dto.companionId;
    if (dto.location && !forSelf && dto.alertType !== AlertType.INCIDENT) {
      throw new BadRequestException(
        'A location can only be shared for yourself or for an assistance alert',
      );
    }
    const sharedBy =
      dto.location && !forSelf ? await this.firstNameOf(callerId) : undefined;
    const location = dto.location
      ? describeLocation(dto.location, false, sharedBy)
      : null;
    await this.assertCompanionCanBeAlerted(callerId, dto.companionId);
    await this.assertNoActiveAlert(dto.companionId);
    const paidById = await this.assertCanAffordAlert(
      callerId,
      dto.companionId,
      dto.payForThisAlert === true,
    );

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
    const firstCircleLinks = circle
      ? await this.prisma.linkSentinels.findMany({
          where: { circleId: circle.id, status: LinkStatus.ACCEPTED },
          include: {
            linkAsSentinel: {
              select: {
                id: true,
                firstName: true,
                phone: true,
                pausedForOthers: true,
              },
            },
          },
        })
      : [];
    if (!circle || !firstCircleLinks.some((link) => link.leadSlot !== null)) {
      throw new ConflictException(
        'This companion’s 1st circle has no Lead Sentinel yet — an alert can’t be raised',
      );
    }
    // A Sentinel paused for others is never asked to take part.
    const links = firstCircleLinks.filter(
      (link) => !link.linkAsSentinel.pausedForOthers,
    );
    if (!links.some((link) => link.leadSlot !== null)) {
      throw new ConflictException(
        'Every Lead Sentinel of this 1st circle is on pause — an alert can’t be raised',
      );
    }

    await this.assertCanRaise(callerId, dto.companionId);

    const companion = await this.prisma.user.findUnique({
      where: { id: dto.companionId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        phoneVerifiedAt: true,
      },
    });
    await this.assertAlertCanBeAnswered(
      callerId,
      dto.companionId,
      companion,
      links,
    );

    const alert = await this.prisma.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          label: ALERT_TYPE_LABELS[dto.alertType],
          messageAlert: location
            ? `${dto.reason}\n\n${location.text}`
            : dto.reason,
          alertStatus: AlertStatus.LAUNCHED,
          alertType: dto.alertType,
          launchedAt: new Date(),
          launchedById: callerId,
          userCompanionId: dto.companionId,
          firstCircleId: circle.id,
          paidById,
        },
      });

      // The responsible Lead from the start: Lead 1 (lowest slot), decided
      // in advance by the companion — never a choice made during the alert.
      // Any other Lead can still take over later (claimLead).
      const responsibleLinkId = links
        .filter((link) => link.leadSlot !== null)
        .sort((a, b) => a.leadSlot!.localeCompare(b.leadSlot!))[0]?.id;

      for (const link of links) {
        await tx.alertParticipant.create({
          data: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            isLead: link.leadSlot !== null,
            leadAssignedAt: link.id === responsibleLinkId ? new Date() : null,
            requestedById: callerId,
            alertId: created.id,
            userSentinelsId: link.id,
          },
        });
      }

      // The 1st circle's own group chat ("1st circle room"), scoped to this
      // alert: every Sentinel of the 1st circle — and the person the alert
      // is about, who can write there too (Sylvie's call, 2026-11).
      await tx.conversation.create({
        data: {
          alertId: created.id,
          participants: {
            create: [
              ...links.map((link) => ({ userId: link.linkAsSentinel.id })),
              { userId: dto.companionId },
            ],
          },
        },
      });

      return created;
    });

    await this.notifyParticipants(
      alert.id,
      links,
      alertRaisedSms(companionFullName(companion), location?.mapUrl, sharedBy),
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
        alertRaisedToCompanionSms(raiser?.firstName ?? 'Une personne Sentinel'),
      );
    }

    await this.notifyAlertParticipants(alert.id, {
      type: NotificationType.ALERT_RAISED,
      actorId: callerId,
    });
    return alert;
  }

  // finalWord (optional): a few closing words ("All fine, thank you all")
  // — the stopper's status note, posted in every chat of the alert they're
  // in, and included in the end-of-alert SMS.
  async closeAlert(callerId: string, alertId: string, finalWord?: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        userCompanion: { select: { firstName: true, phone: true } },
        participants: {
          where: { status: { not: AlertParticipantStatus.CLOSED } },
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

    const word = finalWord?.trim() || null;
    const isCompanion = callerId === alert.userCompanionId;
    const now = new Date();
    const [updatedAlert] = await this.prisma.$transaction([
      this.prisma.alert.update({
        where: { id: alertId },
        data: {
          alertStatus: AlertStatus.RESOLVED,
          closedAt: now,
          closedById: callerId,
          // The closing word becomes the stopper's own side's status.
          ...(word && isCompanion ? { statusByCompanion: word } : {}),
          ...(word && !isCompanion
            ? {
                statusByFirstCircle: word,
                statusUpdatedById: callerId,
                statusUpdatedAt: now,
              }
            : {}),
        },
      }),
      this.prisma.alertParticipant.updateMany({
        where: { alertId },
        data: { closedAt: now },
      }),
      // The chats stay open a few more days (see conversation-closed.ts).
      this.prisma.conversation.updateMany({
        where: { alertId },
        data: { closedAt: alertChatClosingDate(now) },
      }),
    ]);

    // Posted in each of the alert's chats the stopper is in (they stay
    // open 7 more days): everyone reads it where they were talking.
    if (word) {
      const chats = await this.prisma.conversation.findMany({
        where: {
          alertId,
          participants: { some: { userId: callerId, leftAt: null } },
        },
        select: { id: true },
      });
      for (const chat of chats) {
        await this.prisma.message.create({
          data: {
            conversationId: chat.id,
            senderId: callerId,
            type: MessageType.TEXT,
            body: word,
          },
        });
      }
    }

    const text = alertClosedSms(alert.userCompanion.firstName, word);
    await Promise.allSettled(
      alert.participants
        .filter((p) => p.contactedAt && p.circleId !== alert.firstCircleId)
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

  // Any Lead Sentinel can claim active leadership of an alert at any time,
  // including taking it over from another Lead — no wait window, no
  // succession order, no automation (Sylvie's call: simpler than the
  // timed-handoff idea originally in plan.txt). "Current lead" isn't
  // stored separately — it's whichever isLead participant has the latest
  // leadAssignedAt, derived on read (see getAlert's participants).
  async claimLead(callerId: string, alertId: string) {
    const participant = await this.prisma.alertParticipant.findFirst({
      where: { alertId, userSentinels: { userSentinelId: callerId } },
      include: { alert: { select: { alertStatus: true } } },
    });
    if (!participant) {
      throw new NotFoundException('You have no participation on this alert');
    }
    if (!participant.isLead) {
      throw new ForbiddenException('Only a Lead Sentinel can claim the lead');
    }
    if (participant.alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }
    if (participant.status === AlertParticipantStatus.CLOSED) {
      throw new ConflictException('You left this alert');
    }

    await this.prisma.alertParticipant.update({
      where: { id: participant.id },
      data: { leadAssignedAt: new Date() },
    });

    await this.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_LEAD_CLAIMED,
      actorId: callerId,
    });
    return this.getAlert(callerId, alertId);
  }

  // Any Sentinel can step out of an alert ("I can't help anymore"): their
  // participation is CLOSED and they stop being notified. A Lead may only
  // leave once another Lead has claimed the alert after them, so it is
  // never left without someone driving it (Sylvie's call).
  async leaveAlert(callerId: string, alertId: string) {
    const participant = await this.prisma.alertParticipant.findFirst({
      where: { alertId, userSentinels: { userSentinelId: callerId } },
      include: { alert: { select: { alertStatus: true } } },
    });
    if (!participant) {
      throw new NotFoundException('You have no participation on this alert');
    }
    if (participant.alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }
    if (participant.status === AlertParticipantStatus.CLOSED) {
      throw new ConflictException('You already left this alert');
    }
    if (participant.isLead) {
      const takenOver = await this.prisma.alertParticipant.count({
        where: {
          alertId,
          id: { not: participant.id },
          isLead: true,
          status: { not: AlertParticipantStatus.CLOSED },
          leadAssignedAt: participant.leadAssignedAt
            ? { gt: participant.leadAssignedAt }
            : { not: null },
        },
      });
      if (takenOver === 0) {
        throw new ConflictException(
          'Another Lead must take the lead before you leave this alert',
        );
      }
    }

    const updated = await this.prisma.alertParticipant.update({
      where: { id: participant.id },
      data: { status: AlertParticipantStatus.CLOSED, closedAt: new Date() },
    });
    await this.notifyAlertParticipants(alertId);
    return updated;
  }

  // "Pause for others" takes the person out of every alert in progress at
  // once — the same CLOSED state as leaveAlert. A Lead must first leave the
  // alert through leaveAlert (which needs another Lead to take over), same
  // rule as account deletion, so no alert is left without someone driving it.
  // Throws before writing anything.
  async withdrawFromAlertsForPause(userId: string) {
    const participations = await this.prisma.alertParticipant.findMany({
      where: {
        status: { not: AlertParticipantStatus.CLOSED },
        alert: { alertStatus: { not: AlertStatus.RESOLVED } },
        userSentinels: { userSentinelId: userId },
      },
      select: { id: true, alertId: true, isLead: true },
    });
    if (participations.some((p) => p.isLead)) {
      throw new ConflictException(LEAD_CANNOT_PAUSE);
    }
    if (participations.length === 0) return;

    await this.prisma.alertParticipant.updateMany({
      where: { id: { in: participations.map((p) => p.id) } },
      data: { status: AlertParticipantStatus.CLOSED, closedAt: new Date() },
    });
    for (const alertId of new Set(participations.map((p) => p.alertId))) {
      await this.notifyAlertParticipants(alertId);
    }
  }

  async getAlert(callerId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        launchedBy: { select: { id: true, firstName: true } },
        closedBy: { select: { id: true, firstName: true } },
        userCompanion: {
          select: {
            id: true,
            firstName: true,
            // How texts speak about them ("can you go and see her?").
            gender: true,
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
                // avatarPath: cache key for their photo on the alert chat's
                // roster (GET /user/:id/avatar lets 1st-circle co-members
                // see each other's photo).
                linkAsSentinel: {
                  select: {
                    id: true,
                    firstName: true,
                    gender: true,
                    avatarPath: true,
                    pausedForOthers: true,
                  },
                },
              },
            },
            // Who triggered contacting this Sentinel (raiseAlert's 1st-circle
            // fan-out, or requestCircle for an outer circle).
            requestedBy: { select: { id: true, firstName: true } },
            questions: { orderBy: { createdAt: 'asc' } },
          },
        },
        // So a client can find each conversation tied to this alert — the
        // main 1st-circle chat, plus one per outer-circle Sentinel who's
        // opened an isolated chat (getOrCreateCircleChat). `participants`
        // lets the caller tell them apart (any participant outside the
        // 1st circle marks it as an isolated chat, not the main one).
        // Messages are embedded here too so the companion can read every
        // conversation of their alert (they only write in the 1st circle
        // room, not in the isolated chats). Oldest first: the room is
        // always the first one, created with the alert.
        conversations: {
          orderBy: { createdAt: 'asc' },
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

    // The companion writes in every conversation of their alert (the 1st
    // circle room and each isolated chat). Conversations opened before
    // that rule: seat them the first time they open their running alert.
    if (
      callerId === alert.userCompanionId &&
      alert.alertStatus !== AlertStatus.RESOLVED
    ) {
      for (const conv of alert.conversations ?? []) {
        if (
          conv.closedAt ||
          conv.participants.some((p) => p.user.id === callerId)
        ) {
          continue;
        }
        await this.prisma.conversationParticipant.create({
          data: { conversationId: conv.id, userId: callerId },
        });
        conv.participants.push({
          user: { id: callerId, firstName: alert.userCompanion.firstName },
        });
      }
    }

    return { ...alert, timeline: this.buildAlertTimeline(alert) };
  }

  // Chronological view of everything that's happened on this alert —
  // raised/contacted/responded/lead-claimed/closed — assembled purely from
  // data already captured elsewhere (no new schema). Scoped the same way
  // as getAlert itself (companion + 1st circle only): an outer-circle
  // Sentinel's own view (getMyParticipation) deliberately doesn't get one.
  private buildAlertTimeline(alert: {
    launchedAt: Date | null;
    launchedBy: { firstName: string } | null;
    messageAlert: string;
    closedAt: Date | null;
    closedBy: { firstName: string } | null;
    participants: {
      status: AlertParticipantStatus;
      contactedAt: Date | null;
      answeredAt: Date | null;
      closedAt: Date | null;
      leadAssignedAt: Date | null;
      response: string | null;
      circleName: string;
      userSentinels: { linkAsSentinel: { firstName: string } };
    }[];
  }) {
    const events: {
      type:
        | 'ALERT_RAISED'
        | 'CONTACTED'
        | 'RESPONDED'
        | 'LEAD_CLAIMED'
        | 'LEFT'
        | 'ALERT_CLOSED';
      at: Date;
      actorLabel: string;
      detail?: string;
    }[] = [];

    if (alert.launchedAt) {
      events.push({
        type: 'ALERT_RAISED',
        at: alert.launchedAt,
        actorLabel: alert.launchedBy?.firstName ?? 'Sentinel',
        detail: alert.messageAlert,
      });
    }

    for (const p of alert.participants) {
      const name = p.userSentinels.linkAsSentinel.firstName;
      if (p.contactedAt) {
        events.push({
          type: 'CONTACTED',
          at: p.contactedAt,
          actorLabel: name,
          detail: p.circleName,
        });
      }
      if (p.answeredAt) {
        events.push({
          type: 'RESPONDED',
          at: p.answeredAt,
          actorLabel: name,
          detail: p.response ?? undefined,
        });
      }
      if (p.leadAssignedAt) {
        events.push({
          type: 'LEAD_CLAIMED',
          at: p.leadAssignedAt,
          actorLabel: name,
        });
      }
      // closeAlert stamps closedAt on everyone; only a CLOSED status marks
      // someone who left before the end.
      if (p.status === AlertParticipantStatus.CLOSED && p.closedAt) {
        events.push({ type: 'LEFT', at: p.closedAt, actorLabel: name });
      }
    }

    if (alert.closedAt) {
      events.push({
        type: 'ALERT_CLOSED',
        at: alert.closedAt,
        actorLabel: alert.closedBy?.firstName ?? 'Sentinel',
      });
    }

    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // 1st circle (or "Me") targets one specific outer circle with a preset
  // question during an active alert — see plan.txt's escalation model.
  // Re-requesting the same circle (e.g. no one answered) just resets its
  // participants to WAITING rather than erroring, via upsert on the real
  // @@unique([alertId, userSentinelsId]) constraint.
  async requestCircle(
    callerId: string,
    alertId: string,
    dto: RequestCircleDto,
  ) {
    const alert = await this.getAlertToAskOn(callerId, alertId);

    const circle = await this.prisma.circle.findFirst({
      where: {
        id: dto.circleId,
        userCompanionId: alert.userCompanionId,
        circleType: CircleType.BASIC,
        status: CircleStatus.ACTIVE,
      },
      include: {
        userCompanion: { select: { alertChatWithFirstCircle: true } },
      },
    });
    if (!circle) {
      throw new BadRequestException(
        'Not a valid outer circle for this companion',
      );
    }
    // May this circle's Sentinels chat with the 1st circle during this
    // alert? The companion's general switch wins; when it's on, the
    // circle's own setting decides. Frozen on each participant now, so a
    // later settings change doesn't alter this alert.
    const chatWithFirstCircle =
      circle.userCompanion.alertChatWithFirstCircle &&
      circle.alertChatWithFirstCircle;

    const links = await this.prisma.linkSentinels.findMany({
      where: {
        circleId: circle.id,
        status: LinkStatus.ACCEPTED,
        linkAsSentinel: NOT_PAUSED_SENTINEL,
      },
      include: {
        linkAsSentinel: { select: { id: true, phone: true } },
      },
    });
    if (links.length === 0) {
      throw new BadRequestException('This circle has no Sentinel to ask');
    }

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
            alertChatWithFirstCircleAtAlert: chatWithFirstCircle,
            isLead: link.leadSlot !== null,
            requestedById: callerId,
          },
          create: {
            status: AlertParticipantStatus.WAITING,
            circleId: circle.id,
            circleName: circle.label,
            canSendPhoneAtAlert: link.canSendPhone,
            alertChatWithFirstCircleAtAlert: chatWithFirstCircle,
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

    await this.createQuestions(
      alertId,
      batch.map((link) => link.id),
      dto.questionKind,
      callerId,
    );
    await this.notifyParticipants(
      alertId,
      batch,
      await this.questionSms(alert, dto.questionKind),
    );

    await this.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_ESCALATED,
      actorId: callerId,
    });
    return this.getAlert(callerId, alertId);
  }

  // A further question to outer-circle Sentinels already contacted on this
  // alert, whatever they answered before.
  async askQuestion(callerId: string, alertId: string, dto: AskQuestionDto) {
    const alert = await this.getAlertToAskOn(callerId, alertId);

    const participants = await this.prisma.alertParticipant.findMany({
      where: {
        id: { in: dto.participantIds },
        alertId,
        contactedAt: { not: null },
        circleId: { not: alert.firstCircleId },
        userSentinels: { linkAsSentinel: NOT_PAUSED_SENTINEL },
      },
      include: {
        userSentinels: {
          select: { id: true, linkAsSentinel: { select: { phone: true } } },
        },
      },
    });
    if (participants.length !== new Set(dto.participantIds).size) {
      throw new BadRequestException(
        'Only outer-circle Sentinels already contacted can be asked',
      );
    }

    const links = participants.map((p) => p.userSentinels);
    await this.createQuestions(
      alertId,
      links.map((link) => link.id),
      dto.questionKind,
      callerId,
    );
    await this.notifyParticipants(
      alertId,
      links,
      await this.questionSms(alert, dto.questionKind),
    );
    await this.notifyAlertParticipants(alertId);
    return this.getAlert(callerId, alertId);
  }

  // Every question goes through here: the place to add a per-alert limit,
  // since each one costs an SMS.
  private async getAlertToAskOn(callerId: string, alertId: string) {
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
    return alert;
  }

  private async createQuestions(
    alertId: string,
    linkIds: string[],
    kind: AlertQuestionKind,
    askedById: string,
  ) {
    const participants = await this.prisma.alertParticipant.findMany({
      where: { alertId, userSentinelsId: { in: linkIds } },
      select: { id: true },
    });
    await this.prisma.alertQuestion.createMany({
      data: participants.map((p) => ({
        kind,
        askedById,
        alertParticipantId: p.id,
      })),
    });
  }

  private async firstNameOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true },
    });
    return user?.firstName ?? '';
  }

  // The question SMS, worded for the companion's gender.
  private async questionSms(
    alert: { userCompanionId: string },
    kind: AlertQuestionKind,
  ) {
    const companion = await this.prisma.user.findUnique({
      where: { id: alert.userCompanionId },
      select: { firstName: true, lastName: true, gender: true },
    });
    return alertQuestionSms(
      companionFullName(companion),
      kind,
      companion
        ? { firstName: companion.firstName, gender: companion.gender }
        : undefined,
    );
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
  // AlertParticipant's frozen alertChatWithFirstCircleAtAlert,
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
    if (!participant.alertChatWithFirstCircleAtAlert) {
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
            // The person the alert is about writes here too.
            { userId: alert.userCompanionId },
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
  // The 1st circle answers the alert itself; an outer circle answers one
  // question. Answering again replaces the answer while the alert is open.
  async respond(callerId: string, alertId: string, dto: RespondAlertDto) {
    const participant = await this.prisma.alertParticipant.findFirst({
      where: {
        alertId,
        status: {
          in: [
            AlertParticipantStatus.CONTACTED,
            AlertParticipantStatus.RESPONDED,
          ],
        },
        userSentinels: { userSentinelId: callerId },
        alert: { alertStatus: { not: AlertStatus.RESOLVED } },
      },
      include: {
        alert: { select: { firstCircleId: true } },
        questions: { where: { id: dto.questionId ?? '' } },
      },
    });
    if (!participant) {
      throw new ForbiddenException('No pending request for you on this alert');
    }

    const isFirstCircle =
      participant.circleId === participant.alert.firstCircleId;
    const question = participant.questions[0];
    if (!isFirstCircle && !question) {
      throw new BadRequestException('Unknown question');
    }
    // "I'm going" is a commitment the 1st circle counts on: once sent it
    // can't be taken back. "Later" / "Unavailable" stay open (later can
    // still become going).
    if (isFirstCircle && participant.response === 'GOING') {
      throw new ConflictException('You already said you are going');
    }
    const kind = isFirstCircle ? null : (question.kind as AlertQuestionKind);
    const reply = parseAppReply(dto.reply, kind);
    if (!reply) throw new BadRequestException('Not a valid reply');

    const updated = await this.recordReply(
      participant.id,
      reply,
      isFirstCircle ? undefined : question.id,
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
            firstCircleId: true,
            userCompanion: { select: { firstName: true, gender: true } },
          },
        },
        questions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { contactedAt: 'desc' },
    });
    if (!participant) {
      throw new ForbiddenException('You have no participation on this alert');
    }
    return {
      ...participant,
      replyOptions:
        participant.circleId === participant.alert.firstCircleId
          ? FIRST_CIRCLE_REPLIES
          : [],
      questions: participant.questions.map(withReplyOptions),
    };
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
  // The person the alert is about updates where they are (their phone's
  // GPS), as often as they like while the alert runs. The position line of
  // the alert's message is replaced, and the 1st circle room gets it as a
  // message from them, so the history of positions stays readable.
  async updateLocation(
    callerId: string,
    alertId: string,
    dto: AlertLocationDto,
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        conversations: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, closedAt: true },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (callerId !== alert.userCompanionId) {
      throw new ForbiddenException(
        'Only the person the alert is about can share their position',
      );
    }
    if (alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }

    const location = describeLocation(dto, true);
    const messageAlert = POSITION_LINE.test(alert.messageAlert)
      ? alert.messageAlert.replace(POSITION_LINE, location.text)
      : `${alert.messageAlert}\n\n${location.text}`;
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { messageAlert },
    });
    const room = alert.conversations[0];
    if (room && !room.closedAt) {
      await this.prisma.message.create({
        data: {
          conversationId: room.id,
          senderId: callerId,
          type: MessageType.TEXT,
          body: `📍 ${location.text}`,
        },
      });
    }
    await this.notifyAlertParticipants(alertId);
    return updated;
  }

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

  // The latest question per open alert sent to this number, newest first. Only
  // outer circles get questions, so a 1st-circle SMS never lands here.
  async listOpenQuestionsByPhone(phone: string) {
    const questions = await this.prisma.alertQuestion.findMany({
      where: {
        alertParticipant: {
          // A reply from someone on pause is ignored here.
          userSentinels: {
            linkAsSentinel: { phone, ...NOT_PAUSED_SENTINEL },
          },
          alert: { alertStatus: { not: AlertStatus.RESOLVED } },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: OPEN_QUESTION_INCLUDE,
    });
    const alertIds = new Set<string>();
    return questions.filter(({ alertParticipant: { alertId } }) => {
      if (alertIds.has(alertId)) return false;
      alertIds.add(alertId);
      return true;
    });
  }

  async answerQuestion(
    question: OpenAlertQuestion,
    phone: string,
    body: string,
  ) {
    const kind = question.kind as AlertQuestionKind;
    const reply = parseAlertReply(body, kind);
    if (!reply) {
      await this.sms.send(phone, alertReplyHelpSms(kind));
      return { matched: true as const, action: 'alert_reply_not_understood' };
    }

    const participant = question.alertParticipant;
    await this.recordReply(participant.id, reply, question.id);
    await this.sms.send(
      phone,
      alertReplyAckSms(participant.alert.userCompanion.firstName, kind),
    );
    await this.notifyAlertParticipants(participant.alertId, {
      type: NotificationType.ALERT_RESPONSE,
      actorId: participant.userSentinels.userSentinelId,
    });

    return { matched: true as const, action: 'alert_replied' };
  }

  // The only way an answer is stored, by SMS or from the app. The participant
  // keeps the latest answer for the alert timeline.
  private async recordReply(
    participantId: string,
    response: string,
    questionId?: string,
  ) {
    const answeredAt = new Date();
    const [participant] = await this.prisma.$transaction([
      this.prisma.alertParticipant.update({
        where: { id: participantId },
        data: {
          status: AlertParticipantStatus.RESPONDED,
          response,
          answeredAt,
        },
      }),
      ...(questionId
        ? [
            this.prisma.alertQuestion.update({
              where: { id: questionId },
              data: { response, answeredAt },
            }),
          ]
        : []),
    ]);
    return participant;
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
        // Someone who left the alert stops hearing about it.
        participants: {
          where: { status: { not: AlertParticipantStatus.CLOSED } },
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

  // Each alert carries the caller's own participation (null for their own
  // alert), so a client can tell whether it needs them to act — e.g. the
  // dashboard's alert mode — without one getAlert() per row.
  async listMyAlerts(callerId: string) {
    const alerts = await this.prisma.alert.findMany({
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
      include: {
        participants: {
          where: { userSentinels: { userSentinelId: callerId } },
          select: { status: true, circleId: true },
        },
        // Who the alert is about — the History list names them.
        userCompanion: {
          select: { firstName: true, lastName: true, gender: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return alerts.map(({ participants, ...alert }) => ({
      ...alert,
      myParticipation: participants[0] ?? null,
    }));
  }

  // ---- Guards -----------------------------------------------------------

  private async assertCompanionCanBeAlerted(
    callerId: string,
    companionId: string,
  ) {
    const companion = await this.prisma.user.findUnique({
      where: { id: companionId },
      select: { status: true, pausedForMe: true },
    });
    assertNotDeceased(companion, 'This companion');
    assertNotPausedForMe(companion, callerId, companionId);
  }

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

  // Lifetime (not annual) free trial, per plan.txt "What's gated" — the
  // companion being alerted is the one whose trial/subscription counts,
  // regardless of who actually raises the alert. Past the trial, the caller
  // may pay for this single alert: returns who paid it (null = covered).
  private async assertCanAffordAlert(
    callerId: string,
    companionId: string,
    payForThisAlert: boolean,
  ): Promise<string | null> {
    const companion = await this.prisma.user.findUnique({
      where: { id: companionId },
      select: { paidUntil: true },
    });
    if (companion && isSubscribed(companion)) return null;

    const count = await this.prisma.alert.count({
      where: { userCompanionId: companionId },
    });
    if (count < FREE_ALERT_TRIAL_LIMIT) return null;
    if (!payForThisAlert) throw new ForbiddenException(FREE_TRIAL_USED_UP);
    if (!paymentSimulated()) {
      throw new ForbiddenException(PAYMENT_NOT_AVAILABLE);
    }
    return callerId;
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

  // An alert needs someone reachable to act on it. For yourself: your own
  // verified phone and a Lead with a phone. For a companion: a Lead with a
  // phone, or, when you are that Lead, another Sentinel with a phone.
  private async assertAlertCanBeAnswered(
    callerId: string,
    companionId: string,
    companion: { phone: string | null; phoneVerifiedAt: Date | null } | null,
    firstCircleLinks: {
      leadSlot: LeadSlot | null;
      linkAsSentinel: { id: string; phone: string | null };
    }[],
  ) {
    const leads = firstCircleLinks.filter((link) => link.leadSlot !== null);
    const hasLeadWithPhone = leads.some((link) => link.linkAsSentinel.phone);

    if (callerId === companionId) {
      if (!companion?.phone || !companion.phoneVerifiedAt) {
        throw new ConflictException(
          'Add and verify your phone number before raising an alert',
        );
      }
    }
    if (leads.some((link) => link.linkAsSentinel.id === callerId)) {
      const otherSentinel = await this.prisma.linkSentinels.findFirst({
        where: {
          userCompanionId: companionId,
          userSentinelId: { not: callerId },
          status: LinkStatus.ACCEPTED,
          linkAsSentinel: { phone: { not: null }, ...NOT_PAUSED_SENTINEL },
          circle: { circleType: { not: CircleType.RESERVED } },
        },
      });
      if (!otherSentinel) {
        throw new ConflictException(
          'This companion needs another Sentinel with a phone number to answer the alert',
        );
      }
      return;
    }
    if (!hasLeadWithPhone) {
      throw new ConflictException(
        'A Lead Sentinel with a phone number is needed to raise an alert',
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

// Lines describing a shared position in Alert.messageAlert — replaced (not
// piled up) when the person updates it. Also stripped when the account is
// deleted (AccountDeletionService).
export const POSITION_LINE = /^Position (partagée|mise à jour)\b.*$/m;

// Beyond this the position is a rough guess (a computer without GPS
// locates by its internet connection): said so, never refused.
const APPROXIMATE_ACCURACY_M = 1000;

// "± 15 m" / "± 1.5 km" / "± 12 km".
function formatAccuracy(meters: number): string {
  if (meters < 1000) return `± ${Math.round(meters)} m`;
  const km = meters / 1000;
  return `± ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

// The shared GPS position as a map link and
// the line added to the alert's message.
// sharedBy: the first name of whoever sent a position that isn't their own
// alert's (an assistance alert raised by someone on the spot).
function describeLocation(
  loc: AlertLocationDto,
  updated = false,
  sharedBy?: string,
) {
  const lat = loc.latitude.toFixed(5);
  const lng = loc.longitude.toFixed(5);
  // Google's official "show this place" link: opens the Google Maps app on
  // a phone, the web page (no login needed) on a computer.
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const approximate =
    loc.accuracy !== undefined && loc.accuracy > APPROXIMATE_ACCURACY_M;
  const precision =
    loc.accuracy !== undefined
      ? ` (${approximate ? 'approximative, ' : ''}${formatAccuracy(loc.accuracy)})`
      : '';
  const label = updated
    ? 'Position mise à jour'
    : sharedBy
      ? `Position partagée par ${sharedBy}`
      : 'Position partagée';
  return { mapUrl, text: `${label}${precision} : ${mapUrl}` };
}
