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
  Prisma,
  SentinelType,
  User,
  UserType,
} from '@prisma/client';
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
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

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

type LinkWithParties = Prisma.LinkSentinelsGetPayload<{
  include: typeof LINK_WITH_PARTIES;
}>;

@Injectable()
export class SentinelService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
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
  // Guarantees the 1st circle exists, and lists it first.
  async listCircles(userId: string) {
    await this.ensurePrimaryCircle(userId);
    const circles = await this.prisma.circle.findMany({
      where: { userCompanionId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        userSentinels: {
          include: {
            linkAsSentinel: {
              select: { id: true, firstName: true, phone: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Enum ordering can't put FIRST first via orderBy; sort it to the front here.
    return circles.sort((a, b) =>
      a.circleType === CircleType.FIRST
        ? -1
        : b.circleType === CircleType.FIRST
          ? 1
          : 0,
    );
  }

  async updateCircle(userId: string, circleId: string, dto: UpdateCircleDto) {
    await this.ensureCircleOwned(userId, circleId);
    return this.prisma.circle.update({ where: { id: circleId }, data: dto });
  }

  // Circles are never hard-deleted (core schema principle) — this closes the
  // circle instead (status/closedAt), consistent with User/LinkSentinels.
  async deleteCircle(userId: string, circleId: string) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    if (circle.circleType === CircleType.FIRST) {
      throw new ConflictException('The 1st circle cannot be deleted');
    }
    const memberCount = await this.prisma.linkSentinels.count({
      where: { circleId, status: { in: ACTIVE_STATUSES } },
    });
    if (memberCount > 0) {
      throw new ConflictException('Empty the circle before deleting it');
    }
    await this.prisma.circle.update({
      where: { id: circleId },
      data: { status: CircleStatus.CLOSED, closedAt: new Date() },
    });
    return { deleted: true };
  }

  // ---- Me -> Sentinel invitation (site only) --------------------------------

  async inviteSentinel(
    userId: string,
    circleId: string,
    dto: InviteSentinelDto,
  ) {
    const circle = await this.ensureCircleOwned(userId, circleId);
    const phone = dto.phone.trim();

    const linkedUser = await this.prisma.user.findUnique({ where: { phone } });
    if (linkedUser?.id === userId) {
      throw new BadRequestException('You cannot add yourself as a Sentinel');
    }
    // 1st-circle Sentinels must have an account (plan.txt ACCOUNTS & BILLING).
    if (circle.circleType === CircleType.FIRST && !linkedUser) {
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

    const inviter = await this.getUser(userId);
    await this.sms.send(phone, sentinelInvitationSms(this.label(inviter)));
    return link;
  }

  // ---- Sentinel -> Me request (site only, target approves in app) -----------

  async requestToBeSentinel(requesterId: string, dto: RequestSentinelDto) {
    const targetPhone = dto.targetPhone.trim();
    const target = await this.prisma.user.findUnique({
      where: { phone: targetPhone },
    });
    if (!target)
      throw new NotFoundException('No account with this phone number');
    if (target.id === requesterId) {
      throw new BadRequestException(
        'You cannot request to be your own Sentinel',
      );
    }

    const requester = await this.getUser(requesterId);
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

    await this.sms.send(targetPhone, sentinelRequestSms(this.label(requester)));
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
            userCompanion: { select: { id: true, email: true, phone: true } },
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

  async respondToMembership(userId: string, linkId: string, accept: boolean) {
    const link = await this.prisma.linkSentinels.findUnique({
      where: { id: linkId },
      include: LINK_WITH_PARTIES,
    });
    if (!link) throw new NotFoundException('Membership not found');
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

    return this.applyResponse(link, accept, false);
  }

  // ---- Respond by SMS (no account required) ---------------------------------

  // Handles every SMS-driven action, since Sentinels don't need an account:
  //  - OUI/NON to answer a pending link, either direction. The responder is
  //    identified by phone: an invited Sentinel (linkAsSentinel.phone)
  //    answering a Me->Sentinel invitation, or a target "Me"
  //    (userCompanion.phone) approving a Sentinel->Me request.
  //  - NON/STOP/QUITTER from an already-accepted Sentinel = opt out of the
  //    link. Pending links take priority if the number has both.
  // Most recent match wins when several apply to the same number.
  async handleInboundSms(from: string, body: string) {
    const intent = parseSmsReply(body);
    if (intent === 'unknown') {
      return { matched: false as const, reason: 'unrecognized_reply' };
    }
    const phone = from.trim();

    const pending = await this.prisma.linkSentinels.findFirst({
      where: {
        status: LinkStatus.PENDING,
        OR: [
          { initiatedBy: LinkInitiator.COMPANION, linkAsSentinel: { phone } },
          { initiatedBy: LinkInitiator.SENTINEL, userCompanion: { phone } },
        ],
      },
      include: LINK_WITH_PARTIES,
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      await this.applyResponse(pending, intent === 'accept', true);
      return {
        matched: true as const,
        action: intent === 'accept' ? 'accepted' : 'declined',
      };
    }

    // No pending link: a NON/STOP from an active Sentinel means "remove me".
    if (intent === 'decline') {
      const active = await this.prisma.linkSentinels.findFirst({
        where: { status: LinkStatus.ACCEPTED, linkAsSentinel: { phone } },
        include: LINK_WITH_PARTIES,
        orderBy: { createdAt: 'desc' },
      });
      if (active) {
        await this.leaveLink(active, true);
        return { matched: true as const, action: 'left' };
      }
    }

    return { matched: false as const, reason: 'no_actionable_link' };
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
            userCompanion: { select: { id: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return links.map((l) => ({
      linkId: l.id,
      sentinelType: l.sentinelType,
      leadSlot: l.leadSlot,
      circle: {
        id: l.circle.id,
        label: l.circle.label,
        isPrimary: l.circle.circleType === CircleType.FIRST,
      },
      companion: l.circle.userCompanion,
    }));
  }

  // ---- Membership management (companion side) --------------------------------

  async updateMembership(
    userId: string,
    linkId: string,
    dto: UpdateMembershipDto,
  ) {
    const link = await this.getOwnedLink(userId, linkId);

    let circleId = link.circleId;
    let targetIsFirst = link.circle.circleType === CircleType.FIRST;
    if (dto.circleId && dto.circleId !== link.circleId) {
      const target = await this.ensureCircleOwned(userId, dto.circleId); // my own circles only
      circleId = target.id;
      targetIsFirst = target.circleType === CircleType.FIRST;
      // Moving into the 1st circle requires the Sentinel to have an account.
      if (targetIsFirst && link.linkAsSentinel.userType === UserType.ONLY_SMS) {
        throw new BadRequestException(
          'A 1st-circle Sentinel must already have an account',
        );
      }
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
    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
      throw new ConflictException(
        'A pending or active Sentinel link already exists for this person',
      );
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
  private async leaveLink(link: LinkWithParties, viaSms: boolean) {
    await this.assertLeadPreserved(link);
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: { status: LinkStatus.REMOVED },
    });

    const sentinelLabel = this.label(link.linkAsSentinel);
    await this.sendSms(
      link.userCompanion.phone,
      sentinelLeftSms(sentinelLabel),
    );
    if (viaSms) {
      await this.sendSms(
        link.linkAsSentinel.phone,
        sentinelLeaveConfirmSms(this.label(link.userCompanion)),
      );
    }
    return updated;
  }

  private async applyResponse(
    link: LinkWithParties,
    accept: boolean,
    viaSms: boolean,
  ) {
    const updated = await this.prisma.linkSentinels.update({
      where: { id: link.id },
      data: { status: accept ? LinkStatus.ACCEPTED : LinkStatus.DECLINED },
    });

    const companionLabel = this.label(link.userCompanion);
    const sentinelLabel = this.label(link.linkAsSentinel);

    if (link.initiatedBy === LinkInitiator.COMPANION) {
      // Notify the inviter ("Me") of the outcome; if the Sentinel answered by
      // SMS, also send them a confirmation since they have no app feedback.
      await this.sendSms(
        link.userCompanion.phone,
        invitationAnsweredSms(sentinelLabel, accept),
      );
      if (viaSms) {
        const smsBody = accept
          ? sentinelAcceptedSms(companionLabel)
          : sentinelDeclinedSms(companionLabel);
        await this.sendSms(link.linkAsSentinel.phone, smsBody);
      }
    } else {
      // Sentinel -> Me request answered by the target: notify the requester.
      await this.sendSms(
        link.linkAsSentinel.phone,
        requestAnsweredSms(companionLabel, accept),
      );
    }

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
        linkAsSentinel: { select: { userType: true } },
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
  private async assertLeadPreserved(link: {
    id: string;
    circleId: string;
    leadSlot: LeadSlot | null;
    circle: { circleType: CircleType };
  }) {
    if (link.circle.circleType !== CircleType.FIRST || !link.leadSlot) return;
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
    if (otherActive > 0 && otherLeads === 0) {
      throw new ConflictException(
        'Designate another Lead Sentinel before removing this one',
      );
    }
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
