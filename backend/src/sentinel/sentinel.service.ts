import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InitiatedBy, MembershipStatus, Prisma, SentinelType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import {
  invitationAnsweredSms,
  parseSmsReply,
  requestAnsweredSms,
  sentinelAcceptedSms,
  sentinelDeclinedSms,
  sentinelInvitationSms,
  sentinelLeaveConfirmSms,
  sentinelLeftSms,
  sentinelRequestSms,
} from '../sms/messages';

type MembershipWithParties = Prisma.CircleMembershipGetPayload<{
  include: { circle: { include: { owner: true } }; contact: true };
}>;

const MEMBERSHIP_WITH_PARTIES = {
  circle: { include: { owner: true } },
  contact: true,
} as const;
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

const ACTIVE_STATUSES: MembershipStatus[] = [MembershipStatus.PENDING, MembershipStatus.ACCEPTED];

@Injectable()
export class SentinelService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  // ---- Circles (owner side) -------------------------------------------------

  // User-created circles are always "other" circles; the single 1st circle
  // is managed automatically (created on demand, never via this endpoint).
  createCircle(userId: string, dto: CreateCircleDto) {
    return this.prisma.circle.create({
      data: { ownerId: userId, label: dto.label, isPrimary: false },
    });
  }

  // "My circles" with their (accepted + pending) Sentinels — the owner view.
  // Guarantees the 1st circle exists, and lists it first.
  async listCircles(userId: string) {
    await this.ensurePrimaryCircle(userId);
    return this.prisma.circle.findMany({
      where: { ownerId: userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      include: {
        memberships: {
          include: { contact: { select: { id: true, name: true, phone: true, userId: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async updateCircle(userId: string, circleId: string, dto: UpdateCircleDto) {
    await this.ensureCircleOwned(userId, circleId);
    return this.prisma.circle.update({ where: { id: circleId }, data: dto });
  }

  async deleteCircle(userId: string, circleId: string) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (circle.isPrimary) {
      throw new ConflictException('The 1st circle cannot be deleted');
    }
    const memberCount = await this.prisma.circleMembership.count({ where: { circleId } });
    if (memberCount > 0) {
      throw new ConflictException('Empty the circle before deleting it');
    }
    await this.prisma.circle.delete({ where: { id: circleId } });
    return { deleted: true };
  }

  // ---- Me -> Sentinel invitation (site only) --------------------------------

  async inviteSentinel(userId: string, circleId: string, dto: InviteSentinelDto) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    const phone = dto.phone.trim();

    const linkedUser = await this.prisma.user.findUnique({ where: { phone } });
    if (linkedUser?.id === userId) {
      throw new BadRequestException('You cannot add yourself as a Sentinel');
    }
    // 1st-circle Sentinels must have an account (plan.txt ACCOUNTS & BILLING).
    if (circle.isPrimary && !linkedUser) {
      throw new BadRequestException('A 1st-circle Sentinel must already have an account');
    }

    const contact = await this.upsertContact(userId, phone, dto.name, linkedUser?.id);
    await this.assertNoActiveMembership(contact.id);

    const membership = await this.prisma.circleMembership.create({
      data: {
        circleId: circle.id,
        contactId: contact.id,
        status: MembershipStatus.PENDING,
        initiatedBy: InitiatedBy.ME,
        sentinelType: dto.sentinelType ?? SentinelType.SENTINEL,
        // Reference only applies to the 1st circle. When "Me" doesn't say and
        // the 1st circle has no reference yet, bootstrap this one as reference
        // so the mandatory-reference rule is satisfied from the start.
        isReference: await this.resolveIsReference(circle, dto.isReference),
      },
    });

    const inviter = await this.getUser(userId);
    await this.sms.send(phone, sentinelInvitationSms(this.label(inviter)));
    return membership;
  }

  // ---- Sentinel -> Me request (site only, target approves in app) -----------

  async requestToBeSentinel(requesterId: string, dto: RequestSentinelDto) {
    const targetPhone = dto.targetPhone.trim();
    const target = await this.prisma.user.findUnique({ where: { phone: targetPhone } });
    if (!target) throw new NotFoundException('No account with this phone number');
    if (target.id === requesterId) {
      throw new BadRequestException('You cannot request to be your own Sentinel');
    }

    const requester = await this.getUser(requesterId);
    const circle = await this.ensurePrimaryCircle(target.id);
    // Contact lives in the TARGET's circle; userId points at the requester
    // (the Sentinel), and the contact name is the requester's prénom. Reuse
    // an existing contact for this pair if any.
    const contact = await this.upsertContact(target.id, requester.phone, requester.firstName, requesterId);
    await this.assertNoActiveMembership(contact.id);

    const membership = await this.prisma.circleMembership.create({
      data: {
        circleId: circle.id,
        contactId: contact.id,
        status: MembershipStatus.PENDING,
        initiatedBy: InitiatedBy.SENTINEL,
        sentinelType: SentinelType.SENTINEL,
        // Me designates references; a self-request never lands as reference.
        isReference: false,
      },
    });

    await this.sms.send(target.phone, sentinelRequestSms(this.label(requester)));
    return membership;
  }

  // ---- Inboxes (action required) --------------------------------------------

  // Invitations addressed to me (I'm the invited Sentinel), awaiting my answer.
  listMyInvitations(userId: string) {
    return this.prisma.circleMembership.findMany({
      where: {
        status: MembershipStatus.PENDING,
        initiatedBy: InitiatedBy.ME,
        contact: { userId },
      },
      include: {
        circle: {
          select: { id: true, label: true, owner: { select: { id: true, email: true, phone: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Requests from people who want to be my Sentinel, awaiting my approval.
  listIncomingRequests(userId: string) {
    return this.prisma.circleMembership.findMany({
      where: {
        status: MembershipStatus.PENDING,
        initiatedBy: InitiatedBy.SENTINEL,
        circle: { ownerId: userId },
      },
      include: {
        circle: { select: { id: true, label: true } },
        contact: { select: { id: true, name: true, phone: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Respond from site ----------------------------------------------------

  async respondToMembership(userId: string, membershipId: string, accept: boolean) {
    const membership = await this.prisma.circleMembership.findUnique({
      where: { id: membershipId },
      include: { circle: { include: { owner: true } }, contact: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.status !== MembershipStatus.PENDING) {
      throw new ConflictException('This invitation has already been answered');
    }

    // The party who must answer is whoever did NOT initiate the link.
    if (membership.initiatedBy === InitiatedBy.ME) {
      if (membership.contact.userId !== userId) {
        throw new ForbiddenException('This invitation is not addressed to you');
      }
    } else if (membership.circle.ownerId !== userId) {
      throw new ForbiddenException('This request is not addressed to you');
    }

    return this.applyResponse(membership, accept, false);
  }

  // ---- Respond by SMS (no account required) ---------------------------------

  // Handles every SMS-driven action, since Sentinels don't need an account:
  //  - OUI/NON to answer a pending link, either direction. The responder is
  //    identified by phone: an invited Sentinel (contact.phone) answering a
  //    Me->Sentinel invitation, or a target "Me" (circle.owner.phone)
  //    approving a Sentinel->Me request.
  //  - NON/STOP/QUITTER from an already-accepted Sentinel = opt out of the
  //    link. Pending links take priority if the number has both.
  // Most recent match wins when several apply to the same number.
  async handleInboundSms(from: string, body: string) {
    const intent = parseSmsReply(body);
    if (intent === 'unknown') {
      return { matched: false as const, reason: 'unrecognized_reply' };
    }
    const phone = from.trim();

    const pending = await this.prisma.circleMembership.findFirst({
      where: {
        status: MembershipStatus.PENDING,
        OR: [
          { initiatedBy: InitiatedBy.ME, contact: { phone } },
          { initiatedBy: InitiatedBy.SENTINEL, circle: { owner: { phone } } },
        ],
      },
      include: MEMBERSHIP_WITH_PARTIES,
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      await this.applyResponse(pending, intent === 'accept', true);
      return { matched: true as const, action: intent === 'accept' ? 'accepted' : 'declined' };
    }

    // No pending link: a NON/STOP from an active Sentinel means "remove me".
    if (intent === 'decline') {
      const active = await this.prisma.circleMembership.findFirst({
        where: { status: MembershipStatus.ACCEPTED, contact: { phone } },
        include: MEMBERSHIP_WITH_PARTIES,
        orderBy: { createdAt: 'desc' },
      });
      if (active) {
        await this.leaveMembership(active, true);
        return { matched: true as const, action: 'left' };
      }
    }

    return { matched: false as const, reason: 'no_actionable_link' };
  }

  // A Sentinel who does have an account can also opt out from the app.
  async leaveMembershipAsSentinel(userId: string, membershipId: string) {
    const membership = await this.prisma.circleMembership.findUnique({
      where: { id: membershipId },
      include: MEMBERSHIP_WITH_PARTIES,
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.contact.userId !== userId) {
      throw new ForbiddenException('You are not the Sentinel of this link');
    }
    if (membership.status !== MembershipStatus.ACCEPTED) {
      throw new ConflictException('This link is not active');
    }
    return this.leaveMembership(membership, false);
  }

  // ---- Companions (reverse view: people I watch over) -----------------------

  async listCompanions(userId: string) {
    const memberships = await this.prisma.circleMembership.findMany({
      where: {
        status: MembershipStatus.ACCEPTED,
        contact: { userId },
      },
      include: {
        circle: {
          select: {
            id: true,
            label: true,
            isPrimary: true,
            owner: { select: { id: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      sentinelType: m.sentinelType,
      isReference: m.isReference,
      circle: { id: m.circle.id, label: m.circle.label, isPrimary: m.circle.isPrimary },
      companion: m.circle.owner,
    }));
  }

  // ---- Membership management (owner side) -----------------------------------

  async updateMembership(userId: string, membershipId: string, dto: UpdateMembershipDto) {
    const membership = await this.getOwnedMembership(userId, membershipId);

    let circleId = membership.circleId;
    let targetIsPrimary = membership.circle.isPrimary;
    if (dto.circleId && dto.circleId !== membership.circleId) {
      const target = await this.ensureCircleOwned(userId, dto.circleId); // my own circles only
      circleId = target.id;
      targetIsPrimary = target.isPrimary;
      // Moving into the 1st circle requires the Sentinel to have an account.
      if (target.isPrimary && !membership.contact.userId) {
        throw new BadRequestException('A 1st-circle Sentinel must already have an account');
      }
    }

    // Reference only lives in the 1st circle. Moving to an "other" circle
    // clears it; an explicit true outside the 1st circle is rejected.
    let isReference = dto.isReference ?? membership.isReference;
    if (!targetIsPrimary) {
      if (dto.isReference === true) {
        throw new BadRequestException('Only a 1st-circle Sentinel can be a reference');
      }
      isReference = false;
    }

    // Guard the mandatory reference before demoting/moving away the last one.
    if (membership.isReference && !isReference) {
      await this.assertReferencePreserved(membership);
    }

    return this.prisma.circleMembership.update({
      where: { id: membership.id },
      data: {
        circleId,
        sentinelType: dto.sentinelType ?? membership.sentinelType,
        isReference,
      },
    });
  }

  async removeMembership(userId: string, membershipId: string) {
    const membership = await this.getOwnedMembership(userId, membershipId);
    await this.assertReferencePreserved(membership);
    await this.prisma.circleMembership.delete({ where: { id: membership.id } });
    return { deleted: true };
  }

  // ---- Internals ------------------------------------------------------------

  // Sets an accepted link to DECLINED and notifies both sides.
  private async leaveMembership(membership: MembershipWithParties, viaSms: boolean) {
    await this.assertReferencePreserved(membership);
    const updated = await this.prisma.circleMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.DECLINED },
    });

    const sentinelLabel = membership.contact.name?.trim() || membership.contact.phone;
    await this.sms.send(membership.circle.owner.phone, sentinelLeftSms(sentinelLabel));
    if (viaSms) {
      await this.sms.send(membership.contact.phone, sentinelLeaveConfirmSms(this.label(membership.circle.owner)));
    }
    return updated;
  }

  private async applyResponse(membership: MembershipWithParties, accept: boolean, viaSms: boolean) {
    const updated = await this.prisma.circleMembership.update({
      where: { id: membership.id },
      data: { status: accept ? MembershipStatus.ACCEPTED : MembershipStatus.DECLINED },
    });

    const ownerLabel = this.label(membership.circle.owner);
    const sentinelLabel = membership.contact.name?.trim() || membership.contact.phone;

    if (membership.initiatedBy === InitiatedBy.ME) {
      // Notify the inviter ("Me") of the outcome; if the Sentinel answered by
      // SMS, also send them a confirmation since they have no app feedback.
      await this.sms.send(membership.circle.owner.phone, invitationAnsweredSms(sentinelLabel, accept));
      if (viaSms) {
        const body = accept ? sentinelAcceptedSms(ownerLabel) : sentinelDeclinedSms(ownerLabel);
        await this.sms.send(membership.contact.phone, body);
      }
    } else {
      // Sentinel -> Me request answered by the target: notify the requester.
      await this.sms.send(membership.contact.phone, requestAnsweredSms(ownerLabel, accept));
    }

    return updated;
  }

  private async ensureCircleOwned(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('This circle is not yours');
    return circle;
  }

  private async getOwnedMembership(userId: string, membershipId: string) {
    const membership = await this.prisma.circleMembership.findUnique({
      where: { id: membershipId },
      include: {
        circle: { select: { ownerId: true, isPrimary: true } },
        contact: { select: { userId: true } },
      },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.circle.ownerId !== userId) {
      throw new ForbiddenException('This Sentinel is not in one of your circles');
    }
    return membership;
  }

  // Whether a to-be-created invitation should be a reference. Reference only
  // applies to the 1st circle; when "Me" doesn't specify, the first Sentinel
  // of a 1st circle with no reference yet is bootstrapped as reference.
  private async resolveIsReference(circle: { id: string; isPrimary: boolean }, explicit?: boolean) {
    if (!circle.isPrimary) return false;
    if (explicit !== undefined) return explicit;
    const existingRefs = await this.prisma.circleMembership.count({
      where: { circleId: circle.id, isReference: true, status: { in: ACTIVE_STATUSES } },
    });
    return existingRefs === 0;
  }

  // The 1st circle must always keep at least one reference while it still has
  // other active members. Throws if unsetting/removing `membership` (a 1st-
  // circle reference) would strand the circle with members but no reference.
  private async assertReferencePreserved(membership: { id: string; circleId: string; isReference: boolean; circle: { isPrimary: boolean } }) {
    if (!membership.circle.isPrimary || !membership.isReference) return;
    const [otherActive, otherRefs] = await Promise.all([
      this.prisma.circleMembership.count({
        where: { circleId: membership.circleId, status: MembershipStatus.ACCEPTED, id: { not: membership.id } },
      }),
      this.prisma.circleMembership.count({
        where: { circleId: membership.circleId, isReference: true, status: MembershipStatus.ACCEPTED, id: { not: membership.id } },
      }),
    ]);
    if (otherActive > 0 && otherRefs === 0) {
      throw new ConflictException('Designate another reference Sentinel before removing this one');
    }
  }

  // The single 1st circle for an owner, created on demand if missing. Every
  // "Me" must have exactly one (plan.txt CIRCLES & PERMISSIONS); it's also
  // where a Sentinel-initiated request lands.
  private async ensurePrimaryCircle(ownerId: string) {
    const existing = await this.prisma.circle.findFirst({
      where: { ownerId, isPrimary: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.circle.create({ data: { ownerId, label: 'Premier cercle', isPrimary: true } });
  }

  private async upsertContact(ownerId: string, phone: string, name: string, userId?: string | null) {
    const existing = await this.prisma.contact.findFirst({ where: { ownerId, phone } });
    if (existing) {
      // Fill in a newly-known linked user without clobbering the existing name.
      const data: Prisma.ContactUpdateInput = {};
      if (userId && !existing.userId) data.user = { connect: { id: userId } };
      if (Object.keys(data).length === 0) return existing;
      return this.prisma.contact.update({ where: { id: existing.id }, data });
    }
    return this.prisma.contact.create({
      data: {
        owner: { connect: { id: ownerId } },
        phone,
        name,
        ...(userId ? { user: { connect: { id: userId } } } : {}),
      },
    });
  }

  private async assertNoActiveMembership(contactId: string) {
    const active = await this.prisma.circleMembership.findFirst({
      where: { contactId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) {
      throw new ConflictException('A pending or active Sentinel link already exists for this person');
    }
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private label(user: Pick<User, 'email' | 'phone'>): string {
    return user.email ?? user.phone;
  }
}
