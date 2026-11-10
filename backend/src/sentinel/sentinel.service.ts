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
  CircleStatus,
  CircleType,
  LeadSlot,
  LinkInitiator,
  LinkStatus,
  NotificationType,
  Prisma,
  SentinelType,
  UserStatus,
  UserType,
  Gender,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RUNNING_ALERT } from '../common/running-alert';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import {
  lastLeadCannotLeaveSms,
  lastLeadLeftSms,
  lastLeadWantsToLeaveSms,
  sentinelAcceptedSms,
  sentinelDeclinedSms,
  sentinelInvitationSms,
  sentinelLeaveConfirmSms,
} from '../sms/messages';
import { assertNotDeceased } from '../user/user-status.util';
import { FREE_ALERT_TRIAL_LIMIT, isSubscribed } from '../user/plan.util';
import { computeSecurityScore } from './security-score';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import {
  assertCompleteAccount,
  findOrCreateUserByPhone,
  getUserOrThrow,
  userLabel,
} from './sentinel-helpers';
import { smsLang } from '../sms/messages';
import { pendingRecoveryPhone } from './phone-recovery.service';

const ACTIVE_STATUSES: LinkStatus[] = [LinkStatus.PENDING, LinkStatus.ACCEPTED];
// A 1st circle handles an alert together, live: kept small (Sylvie's call).
const FIRST_CIRCLE_MAX = 6;
const LEAD_SLOTS: LeadSlot[] = [
  LeadSlot.LEAD_1,
  LeadSlot.LEAD_2,
  LeadSlot.LEAD_3,
];

const LINK_WITH_PARTIES = {
  linkAsSentinel: true,
  userCompanion: true,
  circle: true,
} as const;

export type LinkWithParties = Prisma.LinkSentinelsGetPayload<{
  include: typeof LINK_WITH_PARTIES;
}>;

type LeadCheckLink = {
  id: string;
  circleId: string;
  leadSlot: LeadSlot | null;
  circle: { circleType: CircleType };
};

@Injectable()
export class SentinelService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly notifications: NotificationService,
  ) {}

  // ---- Circles (companion side) ----------------------------------------------

  // User-created circles are always "other" circles; the single 1st circle
  // (circleType FIRST) is managed automatically, never via this endpoint.
  createCircle(userId: string, dto: CreateCircleDto) {
    return this.prisma.circle.create({
      data: {
        userCompanionId: userId,
        label: dto.label,
        circleType: CircleType.BASIC,
      },
    });
  }

  // "My circles" with their (accepted + pending) Sentinels — the companion view.
  // Guarantees the 1st circle and the reserve circle exist, and lists them
  // first/last respectively.
  async listCircles(userId: string) {
    await this.ensurePrimaryCircle(userId);
    await this.ensureReserveCircle(userId);
    // Deleted circles are only CLOSED (never hard-deleted): leave them out.
    const circles = await this.prisma.circle.findMany({
      where: { userCompanionId: userId, status: CircleStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      include: {
        userSentinels: {
          include: {
            linkAsSentinel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                // Photo's file name, only a cache key: the file itself is
                // served by GET /user/:id/avatar after a link check.
                avatarPath: true,
                // Visible to the people linked to them (see listCompanions).
                publicStatus: true,
                // Shown on their avatar: can't be asked to take part in alerts.
                pausedForOthers: true,
                // How texts speak about them; null = inclusive wording.
                gender: true,
                // Only turned into `subscribed` below: the end date itself
                // stays private.
                paidUntil: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Enum ordering can't express FIRST-first/RESERVED-last via orderBy;
    // sort it here instead.
    const rank = (t: CircleType) =>
      t === CircleType.FIRST ? 0 : t === CircleType.RESERVED ? 2 : 1;
    return circles
      .sort((a, b) => rank(a.circleType) - rank(b.circleType))
      .map((circle) => ({
        ...circle,
        userSentinels: circle.userSentinels.map((m) => ({
          ...m,
          linkAsSentinel: withSubscribed(m.linkAsSentinel),
        })),
      }));
  }

  async updateCircle(userId: string, circleId: string, dto: UpdateCircleDto) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (
      dto.alertChatWithFirstCircle !== undefined &&
      circle.circleType === CircleType.FIRST
    ) {
      throw new BadRequestException(
        'The 1st circle always has its own alert chat — this setting is for other circles',
      );
    }
    return this.prisma.circle.update({ where: { id: circleId }, data: dto });
  }

  // Circles are never hard-deleted (core schema principle) — this closes the
  // circle instead (status/closedAt), consistent with User/LinkSentinels.
  // The 1st circle and the reserve circle are system-managed and can never
  // be deleted. Any still-active Sentinels in the closing circle move to the
  // reserve circle instead of being force-removed (e.g. the "choir" circle
  // closes but those Sentinels stay reachable, just unassigned for now).
  async deleteCircle(userId: string, circleId: string) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (
      circle.circleType === CircleType.FIRST ||
      circle.circleType === CircleType.RESERVED
    ) {
      throw new ConflictException('This circle cannot be deleted');
    }
    const activeLinks = await this.prisma.linkSentinels.findMany({
      where: { circleId, status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (activeLinks.length > 0) {
      const reserve = await this.ensureReserveCircle(userId);
      await this.prisma.linkSentinels.updateMany({
        where: { id: { in: activeLinks.map((l) => l.id) } },
        data: { circleId: reserve.id },
      });
    }
    await this.prisma.circle.update({
      where: { id: circleId },
      data: { status: CircleStatus.CLOSED, closedAt: new Date() },
    });
    return { deleted: true, movedToReserve: activeLinks.length };
  }

  // ---- Me -> Sentinel invitation (site only) --------------------------------

  async inviteSentinel(
    userId: string,
    circleId: string,
    dto: InviteSentinelDto,
  ) {
    const inviter = await getUserOrThrow(this.prisma, userId);
    assertCompleteAccount(inviter);
    assertNotDeceased(inviter, 'Your account');
    const circle = await this.ensureAssignableCircle(userId, circleId);
    const phone = dto.phone.trim();

    const linkedUser = await this.prisma.user.findUnique({ where: { phone } });
    if (linkedUser?.id === userId) {
      throw new BadRequestException('You cannot add yourself as a Sentinel');
    }
    // 1st-circle Sentinels must have an account (plan.txt ACCOUNTS & BILLING).
    // Leads included: a lead slot only exists in the 1st circle.
    const hasAccount = linkedUser && linkedUser.userType !== UserType.ONLY_SMS;
    if (circle.circleType === CircleType.FIRST && !hasAccount) {
      throw new BadRequestException(
        'A 1st-circle Sentinel must already have an account',
      );
    }

    if (circle.circleType === CircleType.FIRST) {
      await this.assertFirstCircleHasRoom(circle.id);
    }

    const sentinelUser = await findOrCreateUserByPhone(
      this.prisma,
      phone,
      dto.name,
      inviter.language,
    );

    const link = await this.createOrReactivateLink({
      userSentinelId: sentinelUser.id,
      userCompanionId: userId,
      circleId: circle.id,
      circleType: circle.circleType,
      initiatedBy: LinkInitiator.COMPANION,
      sentinelType: dto.sentinelType ?? SentinelType.SENTINEL,
      requestedAsLead: dto.requestedAsLead,
    });

    await this.sms.send(
      phone,
      sentinelInvitationSms(userLabel(inviter), smsLang(sentinelUser.language)),
    );
    await this.notifications.create({
      userId: sentinelUser.id,
      type: NotificationType.SENTINEL_INVITATION_RECEIVED,
      actorUserId: userId,
      actorLabel: userLabel(inviter),
      targetId: link.id,
    });
    return link;
  }

  // ---- Sentinel -> Me request (site only, target approves in app) -----------

  async requestToBeSentinel(requesterId: string, dto: RequestSentinelDto) {
    const targetPhone = dto.targetPhone.trim();
    const target = await this.prisma.user.findUnique({
      where: { phone: targetPhone },
    });
    // An ONLY_SMS user can only be a Sentinel, never someone's Companion. Same
    // answer as an unknown number, so this never reveals who is in the app.
    if (!target || target.userType === UserType.ONLY_SMS)
      throw new NotFoundException('No account with this phone number');
    assertNotDeceased(target, 'This companion');
    if (target.id === requesterId) {
      throw new BadRequestException(
        'You cannot request to be your own Sentinel',
      );
    }

    const requester = await getUserOrThrow(this.prisma, requesterId);
    assertCompleteAccount(requester);
    const circle = await this.ensurePrimaryCircle(target.id);
    // The requester already has an account (this endpoint requires one), so
    // no Contact-style stand-in is needed — they're already a User row.
    const link = await this.createOrReactivateLink({
      userSentinelId: requesterId,
      userCompanionId: target.id,
      circleId: circle.id,
      circleType: circle.circleType,
      initiatedBy: LinkInitiator.SENTINEL,
      sentinelType: SentinelType.SENTINEL,
      // Me designates Leads; a self-request never lands with a lead slot.
      requestedAsLead: false,
    });

    await this.notifications.create({
      userId: target.id,
      type: NotificationType.SENTINEL_REQUEST_RECEIVED,
      actorUserId: requesterId,
      actorLabel: userLabel(requester),
      targetId: link.id,
    });
    return link;
  }

  // ---- Inboxes (action required) --------------------------------------------

  // Invitations addressed to me (I'm the invited Sentinel), awaiting my answer.
  listMyInvitations(userId: string) {
    return this.prisma.linkSentinels.findMany({
      where: {
        status: LinkStatus.PENDING,
        initiatedBy: LinkInitiator.COMPANION,
        userSentinelId: userId,
      },
      include: {
        circle: {
          select: {
            id: true,
            label: true,
            userCompanion: {
              select: {
                id: true,
                firstName: true,
                email: true,
                phone: true,
                // "invites you to be their / her / his Sentinel".
                gender: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Requests from people who want to be my Sentinel, awaiting my approval.
  listIncomingRequests(userId: string) {
    return this.prisma.linkSentinels.findMany({
      where: {
        status: LinkStatus.PENDING,
        initiatedBy: LinkInitiator.SENTINEL,
        userCompanionId: userId,
      },
      include: {
        circle: { select: { id: true, label: true } },
        linkAsSentinel: { select: { id: true, firstName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Respond from site ------------------------------------------------------

  async respondToMembership(
    userId: string,
    linkId: string,
    accept: boolean,
    circleId?: string,
  ) {
    const link = await this.prisma.linkSentinels.findUnique({
      where: { id: linkId },
      include: LINK_WITH_PARTIES,
    });
    if (!link) throw new NotFoundException('Membership not found');
    assertNotDeceased(link.userCompanion, 'This companion');
    if (link.status !== LinkStatus.PENDING) {
      throw new ConflictException('This invitation has already been answered');
    }

    // The party who must answer is whoever did NOT initiate the link.
    if (link.initiatedBy === LinkInitiator.COMPANION) {
      if (link.userSentinelId !== userId) {
        throw new ForbiddenException('This invitation is not addressed to you');
      }
    } else if (link.userCompanionId !== userId) {
      throw new ForbiddenException('This request is not addressed to you');
    }

    // A Sentinel-initiated request lands in a placeholder circle while
    // PENDING (see requestToBeSentinel) — the companion only picks the real
    // circle now, at accept time, since they couldn't see the private circle
    // list beforehand.
    let overrides: { circleId: string; leadSlot: LeadSlot | null } | undefined;
    if (accept && link.initiatedBy === LinkInitiator.SENTINEL) {
      if (!circleId) {
        throw new BadRequestException(
          'Choose a circle to accept this Sentinel into',
        );
      }
      const circle = await this.ensureAssignableCircle(userId, circleId);
      // Explicit false: accepting never silently grants a Lead slot — that's
      // a separate, deliberate promotion via updateMembership afterward.
      const leadSlot = await this.resolveLeadSlot(
        { id: circle.id, circleType: circle.circleType },
        false,
      );
      overrides = { circleId: circle.id, leadSlot };
    }

    return this.applyResponse(link, accept, false, overrides);
  }

  // ---- Respond to a proposed move into the 1st circle ------------------------

  // The Sentinel side of a 1st-circle move proposed via updateMembership.
  // Accepting flips circleId to the proposed one; declining just clears the
  // proposal — either way the link was never disturbed while pending.
  async respondToCircleMove(userId: string, linkId: string, accept: boolean) {
    const link = await this.prisma.linkSentinels.findUnique({
      where: { id: linkId },
      include: LINK_WITH_PARTIES,
    });
    if (!link) throw new NotFoundException('Membership not found');
    if (link.userSentinelId !== userId) {
      throw new ForbiddenException('This proposal is not addressed to you');
    }
    assertNotDeceased(link.userCompanion, 'This companion');
    if (!link.proposedCircleId) {
      throw new ConflictException('No pending circle move for this link');
    }
    return this.applyCircleMoveResponse(link, accept);
  }

  // ---- Respond by SMS (no account required) ---------------------------------

  // SmsInboundService decides which of these applies to a received SMS.

  // Sentinel->Me requests are answered in the app, so an SMS only ever answers
  // an invitation. Newest first.
  listInvitationsByPhone(phone: string) {
    return this.prisma.linkSentinels.findMany({
      where: {
        status: LinkStatus.PENDING,
        initiatedBy: LinkInitiator.COMPANION,
        linkAsSentinel: { phone },
      },
      include: LINK_WITH_PARTIES,
      orderBy: { createdAt: 'desc' },
    });
  }

  answerInvitation(link: LinkWithParties, accept: boolean) {
    return this.applyResponse(link, accept, true);
  }

  // The language of the SMS sent to this number (null = French).
  async languageByPhone(phone: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { language: true },
    });
    return user?.language ?? null;
  }

  // Oldest first, so the numbers in an INFO reply stay the same between two
  // messages.
  listActiveLinksByPhone(phone: string) {
    return this.prisma.linkSentinels.findMany({
      where: { status: LinkStatus.ACCEPTED, linkAsSentinel: { phone } },
      include: LINK_WITH_PARTIES,
      orderBy: { createdAt: 'asc' },
    });
  }

  // My own accepted link as the Sentinel, or the matching error.
  private async getMyActiveLinkAsSentinel(userId: string, linkId: string) {
    const link = await this.prisma.linkSentinels.findUnique({
      where: { id: linkId },
      include: LINK_WITH_PARTIES,
    });
    if (!link) throw new NotFoundException('Membership not found');
    if (link.userSentinelId !== userId) {
      throw new ForbiddenException('You are not the Sentinel of this link');
    }
    if (link.status !== LinkStatus.ACCEPTED) {
      throw new ConflictException('This link is not active');
    }
    assertNotDeceased(link.userCompanion, 'This companion');
    return link;
  }

  // A Sentinel who does have an account can also opt out from the app.
  async leaveMembershipAsSentinel(userId: string, linkId: string) {
    const link = await this.getMyActiveLinkAsSentinel(userId, linkId);
    return this.leaveLink(link, false);
  }

  // "Not available for now": the Sentinel puts themself in the companion's
  // reserve without ending the link — same as the companion moving them
  // there (immediate, no consent). Only the companion brings them back.
  // A Lead gives up their slot, unless they're the companion's only Lead;
  // refused while they take part in an alert about this companion.
  async moveSelfToReserve(userId: string, linkId: string) {
    const link = await this.getMyActiveLinkAsSentinel(userId, linkId);
    if (link.circle.circleType === CircleType.RESERVED) {
      throw new ConflictException('You are already in their reserve');
    }
    if (link.circle.circleType === CircleType.GROUP) {
      throw new BadRequestException('Leave the group instead');
    }
    await this.assertLeadPreserved(link);
    const inAlert = await this.prisma.alertParticipant.count({
      where: {
        userSentinelsId: link.id,
        status: { not: AlertParticipantStatus.CLOSED },
        alert: { alertStatus: RUNNING_ALERT },
      },
    });
    if (inAlert > 0) {
      throw new ConflictException(
        'Leave the alert in progress before going to the reserve',
      );
    }

    const reserve = await this.ensureReserveCircle(link.userCompanionId);
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: {
        circleId: reserve.id,
        leadSlot: null,
        requestedAsLead: false,
        proposedCircleId: null,
        callOrder: null,
      },
    });
    await this.notifications.create({
      userId: link.userCompanionId,
      type: NotificationType.SENTINEL_TO_RESERVE,
      actorUserId: link.userSentinelId,
      actorLabel: userLabel(link.linkAsSentinel),
      targetId: link.id,
    });
    return updated;
  }

  // ---- Companions (reverse view: people I watch over) -----------------------

  async listCompanions(userId: string) {
    const links = await this.prisma.linkSentinels.findMany({
      where: {
        status: LinkStatus.ACCEPTED,
        userSentinelId: userId,
      },
      include: {
        circle: {
          select: {
            id: true,
            label: true,
            circleType: true,
            userCompanion: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
                email: true,
                phone: true,
                avatarPath: true,
                publicStatus: true,
                pausedForMe: true,
                paidUntil: true,
                gender: true,
                status: true,
                deathReportedAt: true,
                deathReportedById: true,
                pendingPhone: true,
                phoneRecoveryRequestedAt: true,
                phoneRecoveryConfirmedById: true,
                otpCodeHash: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // proposedCircleId isn't a Prisma relation (a transient reference, not a
    // permanent link — see schema.prisma), so its label is a small separate
    // lookup rather than an `include`.
    const proposedIds = links
      .map((l) => l.proposedCircleId)
      .filter((id): id is string => id !== null);
    const proposedCircles = proposedIds.length
      ? await this.prisma.circle.findMany({
          where: { id: { in: proposedIds } },
          select: { id: true, label: true },
        })
      : [];
    const proposedById = new Map(proposedCircles.map((c) => [c.id, c]));

    // Death-notice eligibility only applies to 1st-circle links with a
    // pending report. A Sentinel/Companion pair has at most one
    // LinkSentinels row ever, so `l` already carries this caller's only
    // possible leadSlot for this companion — no separate lookup needed for
    // "is the caller a Lead here." The single-Lead fallback (any other
    // accepted Sentinel may confirm) does need each circle's current Lead
    // count, batched in one query.
    const pendingFirstCircleIds = links
      .filter(
        (l) =>
          l.circle.circleType === CircleType.FIRST &&
          l.circle.userCompanion.deathReportedAt,
      )
      .map((l) => l.circle.id);
    const leadCounts = pendingFirstCircleIds.length
      ? await this.prisma.linkSentinels.groupBy({
          by: ['circleId'],
          where: {
            circleId: { in: pendingFirstCircleIds },
            status: LinkStatus.ACCEPTED,
            leadSlot: { not: null },
          },
          _count: { _all: true },
        })
      : [];
    const leadCountByCircle = new Map(
      leadCounts.map((c) => [c.circleId, c._count._all]),
    );
    const reporterIds = [
      ...new Set(
        links
          .map((l) => l.circle.userCompanion.deathReportedById)
          .filter((id): id is string => id !== null),
      ),
    ];
    const reporters = reporterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reporterIds } },
          select: { id: true, firstName: true, phone: true },
        })
      : [];
    const reporterById = new Map(reporters.map((r) => [r.id, r]));

    // A 1st-circle Sentinel sees who else shares that 1st circle with them
    // (accepted members only, names only) — batched in one query.
    const firstCircleIds = links
      .filter((l) => l.circle.circleType === CircleType.FIRST)
      .map((l) => l.circle.id);
    const firstCircleLinks = firstCircleIds.length
      ? await this.prisma.linkSentinels.findMany({
          where: {
            circleId: { in: firstCircleIds },
            status: LinkStatus.ACCEPTED,
            userSentinelId: { not: userId },
          },
          select: {
            circleId: true,
            leadSlot: true,
            linkAsSentinel: {
              // publicStatus: co-members of a 1st circle see each other's
              // status (as do the companion and its Sentinels).
              select: {
                id: true,
                firstName: true,
                lastName: true,
                publicStatus: true,
                pausedForOthers: true,
                paidUntil: true,
                gender: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const firstCircleMembersByCircle = new Map<
      string,
      {
        id: string;
        firstName: string | null;
        lastName: string | null;
        publicStatus: string | null;
        pausedForOthers: boolean;
        subscribed: boolean;
        gender: Gender | null;
        isLead: boolean;
      }[]
    >();
    for (const m of firstCircleLinks) {
      const list = firstCircleMembersByCircle.get(m.circleId) ?? [];
      list.push({
        ...withSubscribed(m.linkAsSentinel),
        isLead: m.leadSlot !== null,
      });
      firstCircleMembersByCircle.set(m.circleId, list);
    }

    // Free alert already used? Lets a Sentinel offer them a year before an
    // emergency rather than during one.
    const alertCounts = await this.prisma.alert.groupBy({
      by: ['userCompanionId'],
      where: {
        userCompanionId: { in: links.map((l) => l.circle.userCompanion.id) },
      },
      _count: { _all: true },
    });
    const alertCountByCompanion = new Map(
      alertCounts.map((c) => [c.userCompanionId, c._count._all]),
    );

    return links.map((l) => {
      const companion = l.circle.userCompanion;
      const isPrimary = l.circle.circleType === CircleType.FIRST;
      const isDeceased = companion.status === UserStatus.DECEASED;
      const reportedById = companion.deathReportedById;
      const pending =
        isPrimary && companion.deathReportedAt && reportedById
          ? {
              reportedAt: companion.deathReportedAt,
              reportedByLabel: reporterById.get(reportedById)
                ? userLabel(reporterById.get(reportedById)!)
                : 'Sentinel',
              canConfirmOrReject:
                userId !== reportedById &&
                (l.leadSlot !== null ||
                  leadCountByCircle.get(l.circle.id) === 1),
            }
          : null;

      return {
        linkId: l.id,
        sentinelType: l.sentinelType,
        leadSlot: l.leadSlot,
        circle: {
          id: l.circle.id,
          label: l.circle.label,
          isPrimary,
          isReserve: l.circle.circleType === CircleType.RESERVED,
          // A group link is left by leaving the group, not via the reserve.
          isGroup: l.circle.circleType === CircleType.GROUP,
        },
        proposedCircle: l.proposedCircleId
          ? (proposedById.get(l.proposedCircleId) ?? null)
          : null,
        companion: {
          id: companion.id,
          firstName: companion.firstName,
          lastName: companion.lastName,
          userName: companion.userName,
          email: companion.email,
          phone: companion.phone,
          avatarPath: companion.avatarPath,
          publicStatus: companion.publicStatus,
          // Nobody but them may raise an alert about them right now.
          pausedForMe: companion.pausedForMe,
          // How texts speak about them; null = inclusive wording.
          gender: companion.gender,
          // Yearly subscription running: an alert can always be raised.
          subscribed: isSubscribed(companion),
          // No subscription and the free alert is used: the next alert
          // needs paying (or a year offered).
          freeAlertUsed:
            !isSubscribed(companion) &&
            (alertCountByCompanion.get(companion.id) ?? 0) >=
              FREE_ALERT_TRIAL_LIMIT,
        },
        firstCircleMembers: isPrimary
          ? (firstCircleMembersByCircle.get(l.circle.id) ?? [])
          : [],
        // Lost phone: asking their 1st circle to confirm it's them.
        phoneRecovery: (() => {
          const newPhone = isPrimary ? pendingRecoveryPhone(companion) : null;
          return newPhone
            ? {
                newPhone,
                requestedAt: companion.phoneRecoveryRequestedAt,
                confirmedByMe: companion.phoneRecoveryConfirmedById === userId,
                // Both confirmations in: the code went to the new number.
                codeSent: companion.otpCodeHash !== null,
              }
            : null;
        })(),
        deathNotice: {
          isDeceased,
          pending,
          canReport:
            isPrimary &&
            l.leadSlot !== null &&
            !isDeceased &&
            !companion.deathReportedAt,
        },
      };
    });
  }

  // ---- Membership management (companion side) --------------------------------

  async updateMembership(
    userId: string,
    linkId: string,
    dto: UpdateMembershipDto,
  ) {
    const link = await this.getOwnedLink(userId, linkId);
    if (link.status !== LinkStatus.ACCEPTED) {
      throw new BadRequestException(
        'Only an accepted membership can be updated',
      );
    }

    if (dto.leadSlot) return this.setLeadOrder(link, dto.leadSlot);

    let circleId = link.circleId;
    let targetIsFirst = link.circle.circleType === CircleType.FIRST;
    if (dto.circleId && dto.circleId !== link.circleId) {
      const target = await this.ensureCircleOwned(userId, dto.circleId); // my own circles only
      if (target.status !== CircleStatus.ACTIVE) {
        throw new BadRequestException('This circle is not active');
      }
      targetIsFirst = target.circleType === CircleType.FIRST;
      // Moving into the 1st circle requires the Sentinel to have an account.
      if (targetIsFirst && link.linkAsSentinel.userType === UserType.ONLY_SMS) {
        throw new BadRequestException(
          'A 1st-circle Sentinel must already have an account',
        );
      }

      // The 1st circle needs the Sentinel's consent — they stay exactly
      // where they are, awaiting an answer, instead of moving right away.
      // Any other circle (including reserve) moves them immediately. This is a standalone action: other fields on
      // this same call (sentinelType/requestedAsLead) are ignored here.
      const companion = await getUserOrThrow(this.prisma, userId);
      if (targetIsFirst) {
        await this.assertFirstCircleHasRoom(target.id);
        await this.notifications.create({
          userId: link.userSentinelId,
          type: NotificationType.CIRCLE_MOVE_PROPOSED,
          actorUserId: userId,
          actorLabel: userLabel(companion),
          targetId: link.id,
        });
        return this.prisma.linkSentinels.update({
          where: { id: link.id },
          data: { proposedCircleId: target.id },
        });
      }
      circleId = target.id;
    }

    // Lead slot only lives in the 1st circle. Moving to an "other" circle
    // clears it; an explicit request outside the 1st circle is rejected.
    let leadSlot = link.leadSlot;
    let requestedAsLead = dto.requestedAsLead ?? link.requestedAsLead;
    if (!targetIsFirst) {
      if (dto.requestedAsLead === true) {
        throw new BadRequestException(
          'Only a 1st-circle Sentinel can be a Lead',
        );
      }
      leadSlot = null;
      requestedAsLead = false;
    } else if (dto.requestedAsLead === true && !leadSlot) {
      leadSlot = await this.resolveLeadSlot(
        { id: circleId, circleType: CircleType.FIRST },
        true,
      );
    } else if (dto.requestedAsLead === false) {
      leadSlot = null;
    }

    // Guard the mandatory Lead before demoting/moving away the last one.
    if (link.leadSlot && !leadSlot) {
      await this.assertLeadPreserved(link);
    }

    return this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: {
        circleId,
        sentinelType: dto.sentinelType ?? link.sentinelType,
        requestedAsLead,
        leadSlot,
        callOrder: dto.callOrder ?? link.callOrder,
      },
    });
  }

  // Links are never hard-deleted (core schema principle) — this marks the
  // link REMOVED instead, keeping it permanently referenceable.
  async removeMembership(userId: string, linkId: string) {
    const link = await this.getOwnedLink(userId, linkId);
    await this.assertLeadPreserved(link);
    await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: { status: LinkStatus.REMOVED },
    });
    return { deleted: true };
  }

  // "Me" can block an existing Sentinel link at any time (invite, incoming
  // request, or already-accepted) — unlike REMOVED, a BLOCKED link can never
  // be deleted or reactivated (createOrReactivateLink rejects it
  // permanently, see there). No SMS notification, unlike leave/decline.
  async blockMembership(userId: string, linkId: string) {
    const link = await this.getOwnedLink(userId, linkId);
    if (link.status === LinkStatus.BLOCKED) {
      throw new ConflictException('This link is already blocked');
    }
    await this.assertLeadPreserved(link);
    await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: { status: LinkStatus.BLOCKED },
    });
    return { blocked: true };
  }

  // ---- A whole relationship, both directions (person page) -----------------
  //
  // Two people can be linked both ways (one LinkSentinels row per direction:
  // they watch over me, I watch over them). From someone's page, "end the
  // link" and "block" act on both at once. Nothing is hard-deleted: ending
  // marks the rows REMOVED (reactivatable by a new invite), blocking marks
  // them BLOCKED (permanent — createOrReactivateLink refuses them). The
  // last-Lead guard is checked on both rows before anything changes, so a
  // refusal never leaves one direction ended and not the other.
  async endRelationship(userId: string, otherUserId: string, block: boolean) {
    const live = block
      ? { not: LinkStatus.BLOCKED }
      : { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] };
    const links = await this.prisma.linkSentinels.findMany({
      where: {
        status: live,
        OR: [
          { userCompanionId: userId, userSentinelId: otherUserId },
          { userCompanionId: otherUserId, userSentinelId: userId },
        ],
      },
      include: LINK_WITH_PARTIES,
    });
    if (links.length === 0) {
      throw new NotFoundException('No link with this person');
    }
    for (const link of links) {
      if (link.status === LinkStatus.ACCEPTED) {
        await this.assertLeadPreserved(link);
      }
    }
    for (const link of links) {
      const iAmTheirSentinel = link.userSentinelId === userId;
      if (!block && iAmTheirSentinel && link.status === LinkStatus.ACCEPTED) {
        // Same as leaving from the app: they're told I left.
        await this.leaveLink(link, false);
      } else {
        await this.prisma.linkSentinels.update({
          where: { id: link.id },
          data: { status: block ? LinkStatus.BLOCKED : LinkStatus.REMOVED },
        });
      }
    }
    return { ended: links.length, blocked: block };
  }

  // ---- Messaging permission (permanent Me<->Sentinel channel) ---------------

  // Whether the permanent Me<->Sentinel channel is open between these two:
  // always, as long as one is an accepted Sentinel of the other (either
  // direction) — Sylvie's call (2026-11), matching plan.txt §4: "Me" can
  // always reach each of their Sentinels 1:1. There is no circle-wide
  // chat outside of an alert.
  async canSendDirectMessage(
    userAId: string,
    userBId: string,
  ): Promise<boolean> {
    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        status: LinkStatus.ACCEPTED,
        OR: [
          { userCompanionId: userAId, userSentinelId: userBId },
          { userCompanionId: userBId, userSentinelId: userAId },
        ],
      },
      select: { id: true },
    });
    return link !== null;
  }

  // Counts Sentinels who can actually be reached and are currently active:
  // no pending invitations, no one parked in the reserve circle.
  async getSecurityScore(userId: string) {
    const user = await getUserOrThrow(this.prisma, userId);
    const links = await this.prisma.linkSentinels.findMany({
      where: {
        userCompanionId: userId,
        status: LinkStatus.ACCEPTED,
        linkAsSentinel: { phone: { not: null } },
        circle: {
          status: CircleStatus.ACTIVE,
          circleType: { not: CircleType.RESERVED },
        },
      },
      select: { leadSlot: true },
    });
    return computeSecurityScore({
      hasVerifiedPhone: Boolean(user.phone && user.phoneVerifiedAt),
      hasLeadWithPhone: links.some((link) => link.leadSlot !== null),
      sentinelsWithPhone: links.length,
    });
  }

  // ---- Internals ------------------------------------------------------------

  // A sentinel+companion pair has exactly one LinkSentinels row, ever
  // (@@unique([userSentinelId, userCompanionId]) in schema.prisma) — its
  // whole lifecycle lives on that row. Creates it fresh, reactivates a
  // past (DECLINED/REMOVED) one, or rejects if one is already active.
  private async createOrReactivateLink(params: {
    userSentinelId: string;
    userCompanionId: string;
    circleId: string;
    circleType: CircleType;
    initiatedBy: LinkInitiator;
    sentinelType: SentinelType;
    requestedAsLead?: boolean;
  }) {
    const existing = await this.prisma.linkSentinels.findUnique({
      where: {
        userSentinelId_userCompanionId: {
          userSentinelId: params.userSentinelId,
          userCompanionId: params.userCompanionId,
        },
      },
    });
    if (existing) {
      // BLOCKED is permanent — never reactivated, unlike DECLINED/REMOVED
      // below (plan.txt CIRCLES & PERMISSIONS: blocking "prevents any future
      // request between them").
      if (existing.status === LinkStatus.BLOCKED) {
        throw new ForbiddenException('This person cannot be linked again');
      }
      if (ACTIVE_STATUSES.includes(existing.status)) {
        throw new ConflictException(
          'A pending or active Sentinel link already exists for this person',
        );
      }
    }

    const leadSlot = await this.resolveLeadSlot(
      { id: params.circleId, circleType: params.circleType },
      params.requestedAsLead,
    );
    const data = {
      circleId: params.circleId,
      status: LinkStatus.PENDING,
      initiatedBy: params.initiatedBy,
      sentinelType: params.sentinelType,
      requestedAsLead: params.requestedAsLead ?? false,
      leadSlot,
    };

    if (existing) {
      return this.prisma.linkSentinels.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.linkSentinels.create({
      data: {
        userSentinelId: params.userSentinelId,
        userCompanionId: params.userCompanionId,
        ...data,
      },
    });
  }

  // Sets an accepted link to REMOVED (opted out, as opposed to DECLINED —
  // never having accepted) and notifies both sides.
  async leaveLink(link: LinkWithParties, viaSms: boolean) {
    await this.assertLeadPreserved(link);
    const { otherLeads } = await this.countOtherMembers(link);
    const isLastLead = otherLeads === 0;
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: { status: LinkStatus.REMOVED },
    });

    const sentinelLabel = userLabel(link.linkAsSentinel);
    await this.notifications.create({
      userId: link.userCompanionId,
      type: NotificationType.SENTINEL_LEFT,
      actorUserId: link.userSentinelId,
      actorLabel: sentinelLabel,
      targetId: link.id,
    });
    if (viaSms) {
      await this.sendSms(
        link.linkAsSentinel.phone,
        sentinelLeaveConfirmSms(
          userLabel(link.userCompanion),
          smsLang(link.linkAsSentinel.language),
        ),
      );
    }
    if (isLastLead) {
      await this.sendSms(
        link.userCompanion.phone,
        lastLeadLeftSms(smsLang(link.userCompanion.language)),
      );
    }
    return updated;
  }

  // An SMS has no error screen: a last Lead who can't leave yet is told why,
  // and "Me" is asked to pick another Lead. False when nothing changed.
  async leaveLinkBySms(link: LinkWithParties) {
    const { otherActive, otherLeads } = await this.countOtherMembers(link);
    if (otherActive > 0 && otherLeads === 0) {
      const companionLabel = userLabel(link.userCompanion);
      const sentinelLabel = userLabel(link.linkAsSentinel);
      await this.sendSms(
        link.linkAsSentinel.phone,
        lastLeadCannotLeaveSms(
          companionLabel,
          smsLang(link.linkAsSentinel.language),
        ),
      );
      await this.sendSms(
        link.userCompanion.phone,
        lastLeadWantsToLeaveSms(
          sentinelLabel,
          smsLang(link.userCompanion.language),
        ),
      );
      return false;
    }
    await this.leaveLink(link, true);
    return true;
  }

  // No auto-Lead on acceptance — same reasoning as respondToMembership's
  // accept path: "Me" promotes to Lead separately afterward if they want.
  private async applyCircleMoveResponse(
    link: LinkWithParties,
    accept: boolean,
  ) {
    // Proposals aren't counted in the circle, so it may have filled up since.
    if (accept) await this.assertFirstCircleHasRoom(link.proposedCircleId!);
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: accept
        ? {
            circleId: link.proposedCircleId!,
            proposedCircleId: null,
            leadSlot: null,
          }
        : { proposedCircleId: null }, // decline: nothing else changes
    });
    await this.notifications.create({
      userId: link.userCompanionId,
      type: NotificationType.CIRCLE_MOVE_ANSWERED,
      actorUserId: link.userSentinelId,
      actorLabel: userLabel(link.linkAsSentinel),
      accepted: accept,
      targetId: link.id,
    });
    return updated;
  }

  private async applyResponse(
    link: LinkWithParties,
    accept: boolean,
    viaSms: boolean,
    overrides?: { circleId: string; leadSlot: LeadSlot | null },
  ) {
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: {
        status: accept ? LinkStatus.ACCEPTED : LinkStatus.DECLINED,
        ...overrides,
      },
    });

    const companionLabel = userLabel(link.userCompanion);
    const sentinelLabel = userLabel(link.linkAsSentinel);

    // A Sentinel who answered by SMS has no app feedback.
    if (viaSms) {
      await this.sendSms(
        link.linkAsSentinel.phone,
        accept
          ? sentinelAcceptedSms(
              companionLabel,
              smsLang(link.linkAsSentinel.language),
            )
          : sentinelDeclinedSms(
              companionLabel,
              smsLang(link.linkAsSentinel.language),
            ),
      );
    }

    // Persisted notification to whichever party didn't just respond.
    const [recipientId, actorId, actorLabel] =
      link.initiatedBy === LinkInitiator.COMPANION
        ? [link.userCompanionId, link.userSentinelId, sentinelLabel]
        : [link.userSentinelId, link.userCompanionId, companionLabel];
    await this.notifications.create({
      userId: recipientId,
      type: NotificationType.SENTINEL_LINK_ANSWERED,
      actorUserId: actorId,
      actorLabel,
      accepted: accept,
      targetId: link.id,
    });

    return updated;
  }

  private async ensureCircleOwned(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.userCompanionId !== userId)
      throw new ForbiddenException('This circle is not yours');
    return circle;
  }

  private async getOwnedLink(userId: string, linkId: string) {
    const link = await this.prisma.linkSentinels.findUnique({
      where: { id: linkId },
      include: {
        circle: { select: { userCompanionId: true, circleType: true } },
        linkAsSentinel: {
          select: { userType: true, phone: true, firstName: true },
        },
        userCompanion: { select: { status: true } },
      },
    });
    if (!link) throw new NotFoundException('Membership not found');
    if (link.circle.userCompanionId !== userId) {
      throw new ForbiddenException(
        'This Sentinel is not in one of your circles',
      );
    }
    // A confirmed death freezes the circles as they were.
    assertNotDeceased(link.userCompanion, 'This companion');
    return link;
  }

  // Which lead slot (if any) a to-be-created/updated link should get.
  // Lead slots only apply to the 1st circle (up to 3, @@unique per circle).
  // - explicit === false: no slot.
  // - explicit === undefined: bootstrap — the first Sentinel of a 1st circle
  //   with no Lead yet becomes one automatically.
  // - explicit === true: assign the next free slot, or reject if all 3 taken.
  // A 1st circle stays small — it handles an alert together, live — so at
  // most FIRST_CIRCLE_MAX people (accepted or invited). Throws when full.
  private async assertFirstCircleHasRoom(circleId: string) {
    const count = await this.prisma.linkSentinels.count({
      where: { circleId, status: { in: ACTIVE_STATUSES } },
    });
    if (count >= FIRST_CIRCLE_MAX) {
      throw new ConflictException(
        `A 1st circle can have at most ${FIRST_CIRCLE_MAX} people — add them to another circle`,
      );
    }
  }

  // Lead order: give this 1st-circle Lead the requested slot, swapping with
  // whoever holds it (in one transaction; null first because of the
  // [circleId, leadSlot] unique constraint).
  private async setLeadOrder(
    link: {
      id: string;
      circleId: string;
      leadSlot: LeadSlot | null;
      circle: { circleType: CircleType };
    },
    slot: LeadSlot,
  ) {
    if (link.circle.circleType !== CircleType.FIRST || !link.leadSlot) {
      throw new BadRequestException('Only a 1st-circle Lead has a Lead order');
    }
    if (link.leadSlot === slot) return link;
    const holder = await this.prisma.linkSentinels.findFirst({
      where: {
        circleId: link.circleId,
        leadSlot: slot,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true },
    });
    const results = await this.prisma.$transaction([
      this.prisma.linkSentinels.update({
        where: { id: link.id },
        data: { leadSlot: null },
      }),
      ...(holder
        ? [
            this.prisma.linkSentinels.update({
              where: { id: holder.id },
              data: { leadSlot: link.leadSlot },
            }),
          ]
        : []),
      this.prisma.linkSentinels.update({
        where: { id: link.id },
        data: { leadSlot: slot },
      }),
    ]);
    return results[results.length - 1];
  }

  private async resolveLeadSlot(
    circle: { id: string; circleType: CircleType },
    explicit: boolean | undefined,
  ): Promise<LeadSlot | null> {
    if (circle.circleType !== CircleType.FIRST) return null;

    const activeLeads = await this.prisma.linkSentinels.findMany({
      where: {
        circleId: circle.id,
        status: { in: ACTIVE_STATUSES },
        leadSlot: { not: null },
      },
      select: { leadSlot: true },
    });
    const taken = new Set(activeLeads.map((l) => l.leadSlot));

    if (explicit === false) return null;
    if (explicit === undefined) {
      return taken.size === 0 ? LeadSlot.LEAD_1 : null;
    }
    const free = LEAD_SLOTS.find((slot) => !taken.has(slot));
    if (!free) {
      throw new ConflictException(
        'This 1st circle already has 3 Lead Sentinels',
      );
    }
    return free;
  }

  // The 1st circle must always keep at least one occupied Lead slot while it
  // still has other active members. Throws if vacating `link`'s slot would
  // strand the circle with members but no Lead.
  private async assertLeadPreserved(link: LeadCheckLink) {
    const { otherActive, otherLeads } = await this.countOtherMembers(link);
    if (otherActive > 0 && otherLeads === 0) {
      throw new ConflictException(
        'Designate another Lead Sentinel before removing this one',
      );
    }
  }

  private async countOtherMembers(link: LeadCheckLink) {
    if (link.circle.circleType !== CircleType.FIRST || !link.leadSlot) {
      return { otherActive: 0, otherLeads: 1 };
    }
    const [otherActive, otherLeads] = await Promise.all([
      this.prisma.linkSentinels.count({
        where: {
          circleId: link.circleId,
          status: LinkStatus.ACCEPTED,
          id: { not: link.id },
        },
      }),
      this.prisma.linkSentinels.count({
        where: {
          circleId: link.circleId,
          leadSlot: { not: null },
          status: LinkStatus.ACCEPTED,
          id: { not: link.id },
        },
      }),
    ]);
    return { otherActive, otherLeads };
  }

  // The single 1st circle for a companion, created on demand if missing.
  // Every "Me" must have exactly one (plan.txt CIRCLES & PERMISSIONS); it's
  // also where a Sentinel-initiated request lands.
  private async ensurePrimaryCircle(userCompanionId: string) {
    const existing = await this.prisma.circle.findFirst({
      where: { userCompanionId, circleType: CircleType.FIRST },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.circle.create({
      data: {
        userCompanionId,
        label: 'Premier cercle',
        circleType: CircleType.FIRST,
      },
    });
  }

  // The single reserve circle for a companion, created on demand if missing.
  // Holds Sentinel links that exist but aren't currently active in a real
  // circle (a paused Sentinel, or the survivors of a deleted circle) — never
  // a landing spot for a brand-new invite/request.
  private async ensureReserveCircle(userCompanionId: string) {
    const existing = await this.prisma.circle.findFirst({
      where: { userCompanionId, circleType: CircleType.RESERVED },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.circle.create({
      data: {
        userCompanionId,
        label: 'Sentinelles en réserve',
        circleType: CircleType.RESERVED,
      },
    });
  }

  // A circle a Sentinel can actually be assigned/invited into right now:
  // owned by userId, ACTIVE, and not the reserve circle.
  private async ensureAssignableCircle(userId: string, circleId: string) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (circle.status !== CircleStatus.ACTIVE) {
      throw new BadRequestException('This circle is not active');
    }
    if (circle.circleType === CircleType.RESERVED) {
      throw new BadRequestException(
        'A Sentinel cannot be assigned directly into the reserve circle',
      );
    }
    return circle;
  }

  // plan.txt CORE FEATURES/Auth: an UNCOMPLETE account (email/Google signup,
  // no phone yet) "can browse freely but can't have or be a Sentinel until a
  // phone is added." Every Sentinel/target lookup elsewhere goes through a
  // phone match, so gating just the caller of invite/request is enough.

  // "Me" accounts can exist without a phone (email/Google signup); skip the
  // SMS rather than error when there's nowhere to send it.
  private async sendSms(phone: string | null, body: string) {
    if (!phone) return;
    await this.sms.send(phone, body);
  }
}

// Linked people see whether someone is subscribed (the star on their
// figure), never until when: the end date is swapped for a boolean.
function withSubscribed<T extends { paidUntil: Date | null }>(
  person: T,
): Omit<T, 'paidUntil'> & { subscribed: boolean } {
  const { paidUntil, ...rest } = person;
  return { ...rest, subscribed: isSubscribed({ paidUntil }) };
}
