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
  LinkInitiator,
  LinkStatus,
  NotificationType,
  Prisma,
  SentinelType,
  User,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import { groupInvitationSms } from '../sms/messages';
import { GROUP_NEEDS_PAID, isSubscribed } from '../user/plan.util';
import { CreateGroupDto } from './dto/create-group.dto';
import { InviteToGroupDto } from './dto/invite-to-group.dto';
import {
  assertCompleteAccount,
  findOrCreateUserByPhone,
  getUserOrThrow,
  userLabel,
} from './sentinel-helpers';

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
@Injectable()
export class GroupService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly notifications: NotificationService,
  ) {}

  async createGroup(userId: string, dto: CreateGroupDto) {
    const founder = await getUserOrThrow(this.prisma, userId);
    assertCompleteAccount(founder);
    // Founding a group is paid (joining one someone else founded stays
    // free), per plan.txt ACCOUNTS & BILLING — no trial exception here.
    if (!isSubscribed(founder)) {
      throw new ForbiddenException(GROUP_NEEDS_PAID);
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

  // Two ways in (InviteToGroupDto):
  // - targetUserId: someone I'm already connected to (my contacts list);
  // - phone + name: anyone. No account behind the number: a stand-in User
  //   is created (as for a circle invitation), claimed when they sign up
  //   with that number — the invitation then waits for them in the app.
  // The answer is the same whether the number has an account or not, so
  // nobody can test numbers to find out who uses the app.
  async inviteToGroup(
    userId: string,
    groupRootId: string,
    dto: InviteToGroupDto,
  ) {
    const inviter = await getUserOrThrow(this.prisma, userId);
    assertCompleteAccount(inviter);

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

    const target = dto.phone
      ? await this.groupTargetByPhone(inviter, dto.phone, dto.name)
      : await this.groupTargetFromContacts(userId, dto.targetUserId);

    const alreadyMember = await this.prisma.circle.findFirst({
      where: {
        userCompanionId: target.id,
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
            invitedUserId: target.id,
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
            invitedUserId: target.id,
            invitedById: userId,
          },
        });

    await this.notifications.create({
      userId: target.id,
      type: NotificationType.SENTINEL_GROUP_INVITED,
      actorUserId: userId,
      actorLabel: userLabel(inviter),
      targetId: invitation.id,
    });
    // Always an SMS too: with no account, it's the only way they hear of it.
    if (target.phone) {
      const root = await this.prisma.circle.findUnique({
        where: { id: groupRootId },
        select: { label: true },
      });
      await this.sms.send(
        target.phone,
        groupInvitationSms(
          userLabel(inviter),
          root?.label ?? '',
          target.userType !== UserType.ONLY_SMS,
        ),
      );
    }
    return invitation;
  }

  // Anyone, by phone: the existing account, or a stand-in created for them.
  private async groupTargetByPhone(
    inviter: User,
    rawPhone: string,
    name: string | undefined,
  ) {
    const phone = rawPhone.trim();
    if (!name?.trim()) {
      throw new BadRequestException('A first name is required');
    }
    if (inviter.phone === phone) {
      throw new BadRequestException('You cannot invite yourself');
    }
    return findOrCreateUserByPhone(this.prisma, phone, name.trim());
  }

  // Picked from my contacts: someone I already have an accepted link with,
  // holding a real account.
  private async groupTargetFromContacts(
    userId: string,
    targetUserId: string | undefined,
  ) {
    if (!targetUserId) {
      throw new BadRequestException('Choose someone or enter a phone number');
    }
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot invite yourself');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
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
          { userSentinelId: userId, userCompanionId: targetUserId },
          { userSentinelId: targetUserId, userCompanionId: userId },
        ],
      },
    });
    if (!alreadyLinked) {
      throw new ForbiddenException(
        'You can only invite someone you are already connected to',
      );
    }
    return target;
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

    // Invited by phone with no account: an SMS-only login can see the
    // invitation but the mesh needs a full account (watched over too).
    const invitee = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (invitee?.userType === UserType.ONLY_SMS) {
      throw new ForbiddenException(
        'Create your account with this phone number to join the group',
      );
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
}
