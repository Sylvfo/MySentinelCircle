import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AlertParticipantStatus,
  Prisma,
  AlertStatus,
  CircleStatus,
  CircleType,
  LinkStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RUNNING_ALERT } from '../common/running-alert';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import {
  alertQuestionSms,
  alertReplyAckSms,
  alertReplyHelpSms,
} from '../sms/messages';
import { parseAlertReply, parseAppReply } from './alert-replies';
import type { AlertQuestionKind } from './alert-replies';
import { AskQuestionDto } from './dto/ask-question.dto';
import { RequestCircleDto } from './dto/request-circle.dto';
import { RespondAlertDto } from './dto/respond-alert.dto';
import { NOT_PAUSED_SENTINEL } from '../user/user-status.util';
import { AlertService, companionFullName } from './alert.service';
import { smsLang, type SmsLang } from '../sms/messages';

export const OPEN_QUESTION_INCLUDE = {
  alertParticipant: {
    include: {
      userSentinels: {
        select: {
          userSentinelId: true,
          linkAsSentinel: { select: { language: true } },
        },
      },
      alert: { select: { userCompanion: { select: { firstName: true } } } },
    },
  },
} as const;

export type OpenAlertQuestion = Prisma.AlertQuestionGetPayload<{
  include: typeof OPEN_QUESTION_INCLUDE;
}>;

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

// Reaching beyond the 1st circle during an alert: asking an outer circle
// (in batches) a question, the answers they send from the app or by SMS,
// and the nudge when a batch has gone quiet. The alert itself (raise,
// close, statuses, its detail) stays in AlertService.
@Injectable()
export class OuterCirclesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly notifications: NotificationService,
    private readonly alerts: AlertService,
  ) {}

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
        linkAsSentinel: { select: { id: true, phone: true, language: true } },
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
    await this.alerts.notifyParticipants(
      alertId,
      batch,
      await this.questionSms(alert, dto.questionKind),
    );

    await this.alerts.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_ESCALATED,
      actorId: callerId,
    });
    return this.alerts.getAlert(callerId, alertId);
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
          select: {
            id: true,
            linkAsSentinel: { select: { phone: true, language: true } },
          },
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
    await this.alerts.notifyParticipants(
      alertId,
      links,
      await this.questionSms(alert, dto.questionKind),
    );
    await this.alerts.notifyAlertParticipants(alertId);
    return this.alerts.getAlert(callerId, alertId);
  }

  // Every question goes through here: the place to add a per-alert limit,
  // since each one costs an SMS.
  private async getAlertToAskOn(callerId: string, alertId: string) {
    const alert = await this.alerts.findAlertOrThrow(alertId);
    if (alert.alertStatus === AlertStatus.RESOLVED) {
      throw new ConflictException('This alert is already closed');
    }
    await this.alerts.assertIsCompanionOrFirstCircleMember(
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

  // The question SMS, worded for the companion's gender.
  private async questionSms(
    alert: { userCompanionId: string },
    kind: AlertQuestionKind,
  ) {
    const companion = await this.prisma.user.findUnique({
      where: { id: alert.userCompanionId },
      select: { firstName: true, lastName: true, gender: true },
    });
    // Written in each recipient's language (notifyParticipants).
    return (lang: SmsLang) =>
      alertQuestionSms(
        companionFullName(companion),
        kind,
        companion
          ? { firstName: companion.firstName, gender: companion.gender }
          : undefined,
        lang,
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
        alert: { alertStatus: RUNNING_ALERT },
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
    await this.alerts.notifyAlertParticipants(alertId, {
      type: NotificationType.ALERT_RESPONSE,
      actorId: callerId,
    });
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
          alert: { alertStatus: RUNNING_ALERT },
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
    const lang = smsLang(
      question.alertParticipant.userSentinels.linkAsSentinel.language,
    );
    const reply = parseAlertReply(body, kind);
    if (!reply) {
      await this.sms.send(phone, alertReplyHelpSms(kind, lang));
      return { matched: true as const, action: 'alert_reply_not_understood' };
    }

    const participant = question.alertParticipant;
    await this.recordReply(participant.id, reply, question.id);
    await this.sms.send(
      phone,
      alertReplyAckSms(participant.alert.userCompanion.firstName, kind, lang),
    );
    await this.alerts.notifyAlertParticipants(participant.alertId, {
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
        alert: { alertStatus: RUNNING_ALERT },
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
