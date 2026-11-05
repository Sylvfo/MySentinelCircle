import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CircleStatus,
  CircleType,
  LeadSlot,
  LinkInitiator,
  LinkStatus,
  NotificationType,
  Prisma,
  SentinelType,
  User,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import {
  deathNoticeSms,
  lastLeadCannotLeaveSms,
  lastLeadLeftSms,
  lastLeadWantsToLeaveSms,
  sentinelAcceptedSms,
  sentinelDeclinedSms,
  sentinelInvitationSms,
  sentinelLeaveConfirmSms,
} from '../sms/messages';
import { assertNotDeceased } from '../user/user-status.util';
import { computeSecurityScore } from './security-score';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { InviteToGroupDto } from './dto/invite-to-group.dto';

const ACTIVE_STATUSES: LinkStatus[] = [LinkStatus.PENDING, LinkStatus.ACCEPTED];
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
    const circles = await this.prisma.circle.findMany({
      where: { userCompanionId: userId },
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
    return circles.sort((a, b) => rank(a.circleType) - rank(b.circleType));
  }

  async updateCircle(userId: string, circleId: string, dto: UpdateCircleDto) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (
      dto.canMessageMe !== undefined &&
      circle.circleType === CircleType.FIRST
    ) {
      throw new BadRequestException(
        'The 1st circle is always reachable — canMessageMe can’t be overridden there',
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

  // ---- Groups (mutual mesh, invite-by-connection only) -----------------------
  //
  // A group (e.g. a choir) isn't its own table — the founder's own GROUP
  // circle *is* the group (groupRootId: null), and every other member gets
  // their own GROUP circle pointing at it (groupRootId: <founder's circle
  // id>), permanently stable even if the founder later leaves. Joining
  // makes the new member Sentinel for every existing member and vice versa
  // (full mesh) — but LinkSentinels allows only one relationship ever per
  // pair, so a pair already connected from outside the group is left alone,
  // not duplicated. See SentinelGroupInvitation for why the pending invite
  // can't just be a LinkSentinels row: the inviter and invitee are already
  // connected (that's the eligibility rule below), so that pair's one
  // allowed row already exists elsewhere.

  async createGroup(userId: string, dto: CreateGroupDto) {
    const founder = await this.getUser(userId);
    this.assertCompleteAccount(founder);
    // Founding a group is paid (joining one someone else founded stays
    // free), per plan.txt ACCOUNTS & BILLING — no trial exception here.
    if (!founder.hasPaid) {
      throw new ForbiddenException(
        'A paid Companion account is needed to found a group circle',
      );
    }
    return this.prisma.circle.create({
      data: {
        userCompanionId: userId,
        label: dto.label,
        circleType: CircleType.GROUP,
      },
    });
  }

  // "My" groups, each with its member list (companion id + firstName).
  async listMyGroups(userId: string) {
    const myGroupCircles = await this.prisma.circle.findMany({
      where: {
        userCompanionId: userId,
        circleType: CircleType.GROUP,
        status: CircleStatus.ACTIVE,
      },
    });
    if (myGroupCircles.length === 0) return [];

    const rootIds = myGroupCircles.map((c) => c.groupRootId ?? c.id);
    const allMemberCircles = await this.prisma.circle.findMany({
      where: {
        status: CircleStatus.ACTIVE,
        OR: rootIds.flatMap((rootId) => [
          { id: rootId },
          { groupRootId: rootId },
        ]),
      },
      include: { userCompanion: { select: { id: true, firstName: true } } },
    });
    return rootIds.map((rootId, i) => ({
      rootId,
      label: allMemberCircles.find((c) => c.id === rootId)?.label ?? '',
      // The founder's own circle is the root (groupRootId: null) — only
      // they can delete the whole group, everyone else can only leave.
      isFounder: myGroupCircles[i].groupRootId === null,
      members: allMemberCircles
        .filter((c) => c.id === rootId || c.groupRootId === rootId)
        .map((c) => c.userCompanion),
    }));
  }

  // Only someone the inviter already has an accepted Sentinel/Companion
  // link with can be invited — a trust chain, not a cold invite.
  async inviteToGroup(
    userId: string,
    groupRootId: string,
    dto: InviteToGroupDto,
  ) {
    const inviter = await this.getUser(userId);
    this.assertCompleteAccount(inviter);

    const myCircle = await this.prisma.circle.findFirst({
      where: {
        userCompanionId: userId,
        status: CircleStatus.ACTIVE,
        OR: [{ id: groupRootId }, { groupRootId }],
      },
    });
    if (!myCircle) {
      throw new ForbiddenException('You are not a member of this group');
    }
    if (dto.targetUserId === userId) {
      throw new BadRequestException('You cannot invite yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.userType === UserType.ONLY_SMS) {
      throw new BadRequestException(
        'A group member must already have an account',
      );
    }

    const alreadyLinked = await this.prisma.linkSentinels.findFirst({
      where: {
        status: LinkStatus.ACCEPTED,
        OR: [
          { userSentinelId: userId, userCompanionId: dto.targetUserId },
          { userSentinelId: dto.targetUserId, userCompanionId: userId },
        ],
      },
    });
    if (!alreadyLinked) {
      throw new ForbiddenException(
        'You can only invite someone you are already connected to',
      );
    }

    const alreadyMember = await this.prisma.circle.findFirst({
      where: {
        userCompanionId: dto.targetUserId,
        status: CircleStatus.ACTIVE,
        OR: [{ id: groupRootId }, { groupRootId }],
      },
    });
    if (alreadyMember) {
      throw new ConflictException(
        'This person is already a member of the group',
      );
    }

    const existingInvitation =
      await this.prisma.sentinelGroupInvitation.findUnique({
        where: {
          groupRootId_invitedUserId: {
            groupRootId,
            invitedUserId: dto.targetUserId,
          },
        },
      });
    if (existingInvitation?.status === LinkStatus.PENDING) {
      throw new ConflictException('This person has already been invited');
    }

    const invitation = existingInvitation
      ? await this.prisma.sentinelGroupInvitation.update({
          where: { id: existingInvitation.id },
          data: { status: LinkStatus.PENDING, invitedById: userId },
        })
      : await this.prisma.sentinelGroupInvitation.create({
          data: {
            groupRootId,
            invitedUserId: dto.targetUserId,
            invitedById: userId,
          },
        });

    await this.notifications.create({
      userId: dto.targetUserId,
      type: NotificationType.SENTINEL_GROUP_INVITED,
      actorUserId: userId,
      actorLabel: this.label(inviter),
      targetId: invitation.id,
    });
    return invitation;
  }

  async respondToGroupInvitation(
    userId: string,
    invitationId: string,
    accept: boolean,
  ) {
    const invitation = await this.prisma.sentinelGroupInvitation.findUnique({
      where: { id: invitationId },
      include: { groupRoot: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.invitedUserId !== userId) {
      throw new ForbiddenException('This invitation is not addressed to you');
    }
    if (invitation.status !== LinkStatus.PENDING) {
      throw new ConflictException('This invitation has already been answered');
    }

    if (!accept) {
      return this.prisma.sentinelGroupInvitation.update({
        where: { id: invitationId },
        data: { status: LinkStatus.DECLINED },
      });
    }

    const members = await this.prisma.circle.findMany({
      where: {
        status: CircleStatus.ACTIVE,
        OR: [
          { id: invitation.groupRootId },
          { groupRootId: invitation.groupRootId },
        ],
      },
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.sentinelGroupInvitation.update({
        where: { id: invitationId },
        data: { status: LinkStatus.ACCEPTED },
      });

      // A member who left and got re-invited already has a (closed) circle
      // for this group — @@unique([userCompanionId, groupRootId]) means it
      // must be reactivated, not duplicated.
      const previousCircle = await tx.circle.findUnique({
        where: {
          userCompanionId_groupRootId: {
            userCompanionId: userId,
            groupRootId: invitation.groupRootId,
          },
        },
      });
      const myCircle = previousCircle
        ? await tx.circle.update({
            where: { id: previousCircle.id },
            data: { status: CircleStatus.ACTIVE, closedAt: null },
          })
        : await tx.circle.create({
            data: {
              userCompanionId: userId,
              label: invitation.groupRoot.label,
              circleType: CircleType.GROUP,
              groupRootId: invitation.groupRootId,
            },
          });

      // Each direction is its own row (@@unique is per directed pair) and
      // can be in a different state — handled independently: none yet ->
      // create; REMOVED/DECLINED (e.g. left this same group before) ->
      // reactivate; BLOCKED -> never touched, permanent; PENDING/ACCEPTED
      // (already connected, from this group or from outside it) -> leave
      // as-is.
      const connect = async (
        sentinelId: string,
        companionId: string,
        circleId: string,
      ) => {
        const existing = await tx.linkSentinels.findUnique({
          where: {
            userSentinelId_userCompanionId: {
              userSentinelId: sentinelId,
              userCompanionId: companionId,
            },
          },
        });
        if (!existing) {
          await tx.linkSentinels.create({
            data: {
              userSentinelId: sentinelId,
              userCompanionId: companionId,
              circleId,
              status: LinkStatus.ACCEPTED,
              initiatedBy: LinkInitiator.COMPANION,
              sentinelType: SentinelType.SENTINEL,
            },
          });
          return;
        }
        if (
          existing.status === LinkStatus.REMOVED ||
          existing.status === LinkStatus.DECLINED
        ) {
          await tx.linkSentinels.update({
            where: { id: existing.id },
            data: { status: LinkStatus.ACCEPTED, circleId },
          });
        }
        // BLOCKED, PENDING or ACCEPTED: leave untouched either way.
      };

      for (const member of members) {
        await connect(userId, member.userCompanionId, member.id);
        await connect(member.userCompanionId, userId, myCircle.id);
      }

      return myCircle;
    });
  }

  // Closes the caller's own GROUP circle and undoes the mesh — but only the
  // relationships the group itself created (circleId is one of the group's
  // own circles). A relationship that predates the group, or lives in some
  // other circle, is left untouched.
  // Closes one member's own circle and undoes only the relationships the
  // group itself created with each of `otherMembers` (circleId is one of
  // the group's own circles) — a relationship that predates the group, or
  // lives in some other circle, is left untouched. Shared by leaveGroup
  // (one member, themself) and deleteGroup (every member, in turn).
  private async leaveGroupCircle(
    tx: Prisma.TransactionClient,
    memberUserId: string,
    memberCircleId: string,
    otherMembers: { id: string; userCompanionId: string }[],
    groupCircleIds: Set<string>,
  ) {
    await tx.circle.update({
      where: { id: memberCircleId },
      data: { status: CircleStatus.CLOSED, closedAt: new Date() },
    });

    for (const other of otherMembers) {
      const links = await tx.linkSentinels.findMany({
        where: {
          status: LinkStatus.ACCEPTED,
          OR: [
            {
              userSentinelId: memberUserId,
              userCompanionId: other.userCompanionId,
            },
            {
              userSentinelId: other.userCompanionId,
              userCompanionId: memberUserId,
            },
          ],
        },
      });
      for (const link of links) {
        if (!groupCircleIds.has(link.circleId)) continue;
        await tx.linkSentinels.update({
          where: { id: link.id },
          data: { status: LinkStatus.REMOVED },
        });
      }
    }
  }

  async leaveGroup(userId: string, groupRootId: string) {
    const myCircle = await this.prisma.circle.findFirst({
      where: {
        userCompanionId: userId,
        status: CircleStatus.ACTIVE,
        OR: [{ id: groupRootId }, { groupRootId }],
      },
    });
    if (!myCircle) {
      throw new NotFoundException('You are not a member of this group');
    }

    const members = await this.prisma.circle.findMany({
      where: {
        status: CircleStatus.ACTIVE,
        OR: [{ id: groupRootId }, { groupRootId }],
      },
    });
    const groupCircleIds = new Set(members.map((m) => m.id));
    const others = members.filter((m) => m.id !== myCircle.id);

    return this.prisma.$transaction(async (tx) => {
      await this.leaveGroupCircle(
        tx,
        userId,
        myCircle.id,
        others,
        groupCircleIds,
      );
      return { left: true };
    });
  }

  // Only the founder (whose own circle *is* the group's root) can delete
  // the whole group — every member's circle closes and every group-created
  // relationship unwinds, not just the founder's own. A regular member
  // uses leaveGroup instead, which only ever affects their own membership.
  async deleteGroup(userId: string, groupRootId: string) {
    const root = await this.prisma.circle.findUnique({
      where: { id: groupRootId },
    });
    if (
      !root ||
      root.circleType !== CircleType.GROUP ||
      root.groupRootId !== null
    ) {
      throw new NotFoundException('Group not found');
    }
    if (root.userCompanionId !== userId) {
      throw new ForbiddenException('Only the group’s founder can delete it');
    }
    if (root.status !== CircleStatus.ACTIVE) {
      throw new ConflictException('This group is already closed');
    }

    const members = await this.prisma.circle.findMany({
      where: {
        status: CircleStatus.ACTIVE,
        OR: [{ id: groupRootId }, { groupRootId }],
      },
    });
    const groupCircleIds = new Set(members.map((m) => m.id));

    return this.prisma.$transaction(async (tx) => {
      for (const member of members) {
        const others = members.filter((m) => m.id !== member.id);
        await this.leaveGroupCircle(
          tx,
          member.userCompanionId,
          member.id,
          others,
          groupCircleIds,
        );
      }
      return { deleted: true };
    });
  }

  // Group invitations addressed to me, awaiting my answer.
  listMyGroupInvitations(userId: string) {
    return this.prisma.sentinelGroupInvitation.findMany({
      where: { invitedUserId: userId, status: LinkStatus.PENDING },
      include: {
        groupRoot: { select: { id: true, label: true } },
        invitedBy: { select: { id: true, firstName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Me -> Sentinel invitation (site only) --------------------------------

  async inviteSentinel(
    userId: string,
    circleId: string,
    dto: InviteSentinelDto,
  ) {
    const inviter = await this.getUser(userId);
    this.assertCompleteAccount(inviter);
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

    const sentinelUser = await this.findOrCreateUserByPhone(phone, dto.name);

    const link = await this.createOrReactivateLink({
      userSentinelId: sentinelUser.id,
      userCompanionId: userId,
      circleId: circle.id,
      circleType: circle.circleType,
      initiatedBy: LinkInitiator.COMPANION,
      sentinelType: dto.sentinelType ?? SentinelType.SENTINEL,
      requestedAsLead: dto.requestedAsLead,
    });

    await this.sms.send(phone, sentinelInvitationSms(this.label(inviter)));
    await this.notifications.create({
      userId: sentinelUser.id,
      type: NotificationType.SENTINEL_INVITATION_RECEIVED,
      actorUserId: userId,
      actorLabel: this.label(inviter),
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

    const requester = await this.getUser(requesterId);
    this.assertCompleteAccount(requester);
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
      actorLabel: this.label(requester),
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
              select: { id: true, firstName: true, email: true, phone: true },
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

  // Oldest first, so the numbers in an INFO reply stay the same between two
  // messages.
  listActiveLinksByPhone(phone: string) {
    return this.prisma.linkSentinels.findMany({
      where: { status: LinkStatus.ACCEPTED, linkAsSentinel: { phone } },
      include: LINK_WITH_PARTIES,
      orderBy: { createdAt: 'asc' },
    });
  }

  // A Sentinel who does have an account can also opt out from the app.
  async leaveMembershipAsSentinel(userId: string, linkId: string) {
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
    return this.leaveLink(link, false);
  }

  // ---- Death notice (report / confirm / reject) ------------------------------
  //
  // A permanent state, deliberately outside the Alert model — Alert is a
  // resolvable, time-boxed emergency, a death never "resolves." No new
  // tables either: the report/confirm flow and announcement text are flat
  // fields on User (like Alert's own launchedAt/closedAt), and recipient
  // opt-in + personal message are flat fields on LinkSentinels (alongside
  // canSendPhone/canMessageMe) — a literal "memorial circle" doesn't work
  // since a Sentinel/Companion pair has only one LinkSentinels row ever.

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
    const companion = await this.getUser(companionId);
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

    const reporter = await this.getUser(callerId);
    const confirmerIds = await this.getEligibleConfirmerIds(
      circle.id,
      callerId,
    );
    for (const confirmerId of confirmerIds) {
      await this.notifications.create({
        userId: confirmerId,
        type: NotificationType.DEATH_NOTICE_REPORTED,
        actorUserId: callerId,
        actorLabel: this.label(reporter),
        targetId: companionId,
      });
    }
    return { reported: true };
  }

  async confirmDeath(callerId: string, companionId: string) {
    const companion = await this.getUser(companionId);
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
    const companion = await this.getUser(companionId);
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

    const { deathReportedById } = companion;
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
                status: true,
                deathReportedAt: true,
                deathReportedById: true,
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
        isLead: boolean;
      }[]
    >();
    for (const m of firstCircleLinks) {
      const list = firstCircleMembersByCircle.get(m.circleId) ?? [];
      list.push({ ...m.linkAsSentinel, isLead: m.leadSlot !== null });
      firstCircleMembersByCircle.set(m.circleId, list);
    }

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
                ? this.label(reporterById.get(reportedById)!)
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
        },
        firstCircleMembers: isPrimary
          ? (firstCircleMembersByCircle.get(l.circle.id) ?? [])
          : [],
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
      const companion = await this.getUser(userId);
      if (targetIsFirst) {
        await this.notifications.create({
          userId: link.userSentinelId,
          type: NotificationType.CIRCLE_MOVE_PROPOSED,
          actorUserId: userId,
          actorLabel: this.label(companion),
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

    // Messaging settings only mean anything for an account-holding Sentinel
    // — Sentinel SMS is always predefined-replies-only, regardless.
    if (
      (dto.canMessageOwnCircle !== undefined ||
        dto.firstCircleMessagingMode !== undefined ||
        dto.canMessageMe !== undefined) &&
      link.linkAsSentinel.userType === UserType.ONLY_SMS
    ) {
      throw new BadRequestException(
        'Messaging settings only apply to an account-holding Sentinel',
      );
    }

    return this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: {
        circleId,
        sentinelType: dto.sentinelType ?? link.sentinelType,
        requestedAsLead,
        leadSlot,
        canMessageOwnCircle:
          dto.canMessageOwnCircle ?? link.canMessageOwnCircle,
        firstCircleMessagingMode:
          dto.firstCircleMessagingMode ?? link.firstCircleMessagingMode,
        canMessageMe: dto.canMessageMe ?? link.canMessageMe,
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

  // ---- Messaging permission (permanent Me<->Sentinel channel) ---------------

  // Resolves whether the permanent Me<->Sentinel channel is open between
  // these two — most specific non-null setting wins: LinkSentinels
  // .canMessageMe > Circle.canMessageMe > User.allowMessagingByDefault.
  // Direction-agnostic: whichever of the two is "Me" in the underlying
  // LinkSentinels row drives the resolution. The 1st circle is always
  // reachable, no override possible there. Not an accepted Sentinel of
  // each other at all -> false. Separate from canMessageOwnCircle/
  // firstCircleMessagingMode, which only govern alert-time reach.
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
      include: {
        circle: { select: { circleType: true, canMessageMe: true } },
        userCompanion: { select: { allowMessagingByDefault: true } },
      },
    });
    if (!link) return false;
    if (link.circle.circleType === CircleType.FIRST) return true;
    if (link.canMessageMe !== null) return link.canMessageMe;
    if (link.circle.canMessageMe !== null) return link.circle.canMessageMe;
    return link.userCompanion.allowMessagingByDefault;
  }

  // Counts Sentinels who can actually be reached and are currently active:
  // no pending invitations, no one parked in the reserve circle.
  async getSecurityScore(userId: string) {
    const user = await this.getUser(userId);
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

  // Finds or creates a Sentinel-by-phone. Every party is a User row now (no
  // separate Contact model) — a phone-only Sentinel is a User with
  // userType ONLY_SMS. Phone is globally unique, so this is a single lookup,
  // not scoped per companion like the old Contact list was.
  private async findOrCreateUserByPhone(
    phone: string,
    name: string,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    // A number that only ever started a phone login has no name yet.
    if (existing?.firstName === '') {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { firstName: name },
      });
    }
    if (existing) return existing;
    return this.prisma.user.create({
      data: { phone, firstName: name, userType: UserType.ONLY_SMS },
    });
  }

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

    const sentinelLabel = this.label(link.linkAsSentinel);
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
        sentinelLeaveConfirmSms(this.label(link.userCompanion)),
      );
    }
    if (isLastLead) {
      await this.sendSms(link.userCompanion.phone, lastLeadLeftSms());
    }
    return updated;
  }

  // An SMS has no error screen: a last Lead who can't leave yet is told why,
  // and "Me" is asked to pick another Lead. False when nothing changed.
  async leaveLinkBySms(link: LinkWithParties) {
    const { otherActive, otherLeads } = await this.countOtherMembers(link);
    if (otherActive > 0 && otherLeads === 0) {
      const companionLabel = this.label(link.userCompanion);
      const sentinelLabel = this.label(link.linkAsSentinel);
      await this.sendSms(
        link.linkAsSentinel.phone,
        lastLeadCannotLeaveSms(companionLabel),
      );
      await this.sendSms(
        link.userCompanion.phone,
        lastLeadWantsToLeaveSms(sentinelLabel),
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
      actorLabel: this.label(link.linkAsSentinel),
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

    const companionLabel = this.label(link.userCompanion);
    const sentinelLabel = this.label(link.linkAsSentinel);

    // A Sentinel who answered by SMS has no app feedback.
    if (viaSms) {
      await this.sendSms(
        link.linkAsSentinel.phone,
        accept
          ? sentinelAcceptedSms(companionLabel)
          : sentinelDeclinedSms(companionLabel),
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
      },
    });
    if (!link) throw new NotFoundException('Membership not found');
    if (link.circle.userCompanionId !== userId) {
      throw new ForbiddenException(
        'This Sentinel is not in one of your circles',
      );
    }
    return link;
  }

  // Which lead slot (if any) a to-be-created/updated link should get.
  // Lead slots only apply to the 1st circle (up to 3, @@unique per circle).
  // - explicit === false: no slot.
  // - explicit === undefined: bootstrap — the first Sentinel of a 1st circle
  //   with no Lead yet becomes one automatically.
  // - explicit === true: assign the next free slot, or reject if all 3 taken.
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
  private assertCompleteAccount(user: Pick<User, 'userType'>) {
    if (user.userType === UserType.UNCOMPLETE) {
      throw new ForbiddenException(
        'Add a phone number to your account before using Sentinels',
      );
    }
    if (user.userType === UserType.ONLY_SMS) {
      throw new ForbiddenException('Complete your profile first');
    }
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private label(user: Pick<User, 'firstName' | 'phone'>): string {
    return user.firstName ?? user.phone ?? 'Sentinel';
  }

  // "Me" accounts can exist without a phone (email/Google signup); skip the
  // SMS rather than error when there's nowhere to send it.
  private async sendSms(phone: string | null, body: string) {
    if (!phone) return;
    await this.sms.send(phone, body);
  }
}
