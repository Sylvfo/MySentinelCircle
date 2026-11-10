import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertParticipantStatus,
  CircleStatus,
  CircleType,
  LinkStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RUNNING_WATCH } from '../common/running-alert';
import { travelCircleLabel, watchType } from './watch-rules';
import {
  AddTravellerDto,
  CreateTravelCircleDto,
  EndChoice,
  EndWatchDto,
} from './dto/watch.dto';

const ACTIVE_LINK = [LinkStatus.PENDING, LinkStatus.ACCEPTED];
const RESERVE_LABEL = 'Sentinelles en réserve';

const PERSON = {
  select: { id: true, firstName: true, lastName: true, avatarPath: true },
} satisfies Prisma.UserDefaultArgs;

// What happens to each person added for a trip once it ends.
export interface EndPlan {
  forAll: Exclude<EndChoice, 'CIRCLE'>;
  perPerson: Map<string, { choice: EndChoice; circleId?: string }>;
}

// The people of a trip. Two ways in:
// - added for the trip: invited into a travel circle (a real Circle with
//   tripId — BASIC, or GROUP for a travel group, where everyone watches
//   over everyone), through the usual invitations;
// - already a Sentinel: they stay in their own circle, and an
//   AlertParticipant on the trip counts them in a travel circle.
// At the end of the trip only the first kind changes place.
@Injectable()
export class TravelCircleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // For the trip's page: each travel circle, who was added for the trip,
  // and which existing Sentinels come along.
  async peopleOf(tripId: string, ownerId: string) {
    const circles = await this.prisma.circle.findMany({
      where: { tripId, userCompanionId: ownerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        circleType: true,
        status: true,
        userSentinels: {
          where: { status: { in: ACTIVE_LINK } },
          select: { id: true, status: true, linkAsSentinel: PERSON },
        },
      },
    });
    const travellers = await this.prisma.alertParticipant.findMany({
      where: {
        alertId: tripId,
        status: { not: AlertParticipantStatus.CLOSED },
      },
      select: {
        id: true,
        circleId: true,
        userSentinels: { select: { id: true, linkAsSentinel: PERSON } },
      },
    });
    return circles.map((c) => ({
      id: c.id,
      label: c.label,
      isGroup: c.circleType === CircleType.GROUP,
      status: c.status,
      addedForTrip: c.userSentinels.map((l) => ({
        linkId: l.id,
        status: l.status,
        person: l.linkAsSentinel,
      })),
      alreadySentinels: travellers
        .filter((t) => t.circleId === c.id)
        .map((t) => ({
          participantId: t.id,
          linkId: t.userSentinels.id,
          person: t.userSentinels.linkAsSentinel,
        })),
    }));
  }

  // "Nouveau cercle du voyage" / "Nouveau groupe de voyage". Invitations
  // into it are the usual ones (POST /sentinel/circles/:id/invite, or
  // /sentinel/groups/:rootId/invite for a group).
  async createCircle(
    ownerId: string,
    tripId: string,
    dto: CreateTravelCircleDto,
  ) {
    const trip = await this.findRunningTrip(ownerId, tripId);
    const circleType = dto.group ? CircleType.GROUP : CircleType.BASIC;
    const count = await this.prisma.circle.count({
      where: { tripId, userCompanionId: ownerId, circleType },
    });
    const label =
      dto.label?.trim() ||
      travelCircleLabel(trip.label, !!dto.group, count + 1);
    return this.prisma.circle.create({
      data: { label, circleType, userCompanionId: ownerId, tripId },
    });
  }

  async addTraveller(ownerId: string, tripId: string, dto: AddTravellerDto) {
    await this.findRunningTrip(ownerId, tripId);
    const circle = await this.prisma.circle.findFirst({
      where: {
        id: dto.circleId,
        tripId,
        userCompanionId: ownerId,
        circleType: CircleType.BASIC,
        status: CircleStatus.ACTIVE,
      },
    });
    if (!circle) {
      throw new BadRequestException('Not a travel circle of this trip');
    }
    const link = await this.prisma.linkSentinels.findFirst({
      where: {
        id: dto.linkId,
        userCompanionId: ownerId,
        status: LinkStatus.ACCEPTED,
      },
      include: { circle: { select: { tripId: true } } },
    });
    if (!link) throw new NotFoundException('Sentinel not found');
    if (link.circle.tripId === tripId) {
      throw new ConflictException('Already in a travel circle of this trip');
    }
    const existing = await this.prisma.alertParticipant.findUnique({
      where: {
        alertId_userSentinelsId: { alertId: tripId, userSentinelsId: link.id },
      },
    });
    if (existing && existing.status !== AlertParticipantStatus.CLOSED) {
      throw new ConflictException('Already on this trip');
    }
    const counted = {
      status: AlertParticipantStatus.WAITING,
      closedAt: null,
      circleId: circle.id,
      circleName: circle.label,
      canSendPhoneAtAlert: link.canSendPhone,
      isLead: false,
      requestedById: ownerId,
    };
    await this.prisma.alertParticipant.upsert({
      where: {
        alertId_userSentinelsId: { alertId: tripId, userSentinelsId: link.id },
      },
      update: counted,
      create: { ...counted, alertId: tripId, userSentinelsId: link.id },
    });
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { firstName: true },
    });
    await this.notifications.create({
      userId: link.userSentinelId,
      type: NotificationType.TRAVEL_CIRCLE_ADDED,
      actorUserId: ownerId,
      actorLabel: owner?.firstName,
      targetId: tripId,
    });
  }

  async removeTraveller(
    ownerId: string,
    tripId: string,
    participantId: string,
  ) {
    await this.findRunningTrip(ownerId, tripId);
    const participant = await this.prisma.alertParticipant.findFirst({
      where: {
        id: participantId,
        alertId: tripId,
        status: { not: AlertParticipantStatus.CLOSED },
      },
    });
    if (!participant) throw new NotFoundException('Not on this trip');
    await this.prisma.alertParticipant.update({
      where: { id: participant.id },
      data: { status: AlertParticipantStatus.CLOSED, closedAt: new Date() },
    });
  }

  // ---- End of the trip ------------------------------------------------------

  // Checks the choices before anything changes.
  async endPlan(
    ownerId: string,
    tripId: string,
    dto: EndWatchDto,
  ): Promise<EndPlan> {
    const perPerson = new Map<
      string,
      { choice: EndChoice; circleId?: string }
    >();
    if (dto.perPerson?.length) {
      const added = await this.prisma.linkSentinels.findMany({
        where: {
          userCompanionId: ownerId,
          status: { in: ACTIVE_LINK },
          circle: { tripId, userCompanionId: ownerId },
        },
        select: { id: true },
      });
      const addedIds = new Set(added.map((l) => l.id));
      for (const p of dto.perPerson) {
        if (!addedIds.has(p.linkId)) {
          throw new BadRequestException('Not someone added for this trip');
        }
        if (p.choice === 'CIRCLE') {
          await this.assertMoveTarget(ownerId, tripId, p.circleId!);
        }
        perPerson.set(p.linkId, { choice: p.choice, circleId: p.circleId });
      }
    }
    return { forAll: dto.forAll ?? 'RESERVE', perPerson };
  }

  // The people added for the trip go where the person chose (the reserve by
  // default); a pending invitation ends with the trip; a travel group
  // always closes (each other member's links from it go to their own
  // reserve); existing Sentinels just stop being counted on the trip.
  async endOfTrip(
    tx: Prisma.TransactionClient,
    ownerId: string,
    tripId: string,
    plan: EndPlan,
    now: Date,
  ) {
    const circles = await tx.circle.findMany({
      where: { tripId, status: CircleStatus.ACTIVE },
      select: { id: true, userCompanionId: true, circleType: true },
    });
    const circleById = new Map(circles.map((c) => [c.id, c]));
    const links = await tx.linkSentinels.findMany({
      where: {
        circleId: { in: [...circleById.keys()] },
        status: { in: ACTIVE_LINK },
      },
      select: { id: true, status: true, circleId: true, userCompanionId: true },
    });

    const reserves = new Map<string, string>();
    const reserveOf = async (userId: string) => {
      const known = reserves.get(userId);
      if (known) return known;
      const reserve =
        (await tx.circle.findFirst({
          where: { userCompanionId: userId, circleType: CircleType.RESERVED },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })) ??
        (await tx.circle.create({
          data: {
            userCompanionId: userId,
            label: RESERVE_LABEL,
            circleType: CircleType.RESERVED,
          },
          select: { id: true },
        }));
      reserves.set(userId, reserve.id);
      return reserve.id;
    };
    const moveTo = (linkId: string, circleId: string) =>
      tx.linkSentinels.update({
        where: { id: linkId },
        data: { circleId, leadSlot: null, requestedAsLead: false },
      });

    const kept = new Set<string>();
    for (const link of links) {
      const circle = circleById.get(link.circleId)!;
      if (link.status === LinkStatus.PENDING) {
        await tx.linkSentinels.update({
          where: { id: link.id },
          data: { status: LinkStatus.REMOVED },
        });
        continue;
      }
      if (circle.userCompanionId !== ownerId) {
        // Another member's circle of a travel group.
        await moveTo(link.id, await reserveOf(link.userCompanionId));
        continue;
      }
      const picked = plan.perPerson.get(link.id) ?? {
        choice: plan.forAll,
      };
      let choice = picked.choice;
      const circleId = picked.circleId;
      if (choice === 'KEEP' && circle.circleType === CircleType.GROUP) {
        choice = 'RESERVE';
      }
      if (choice === 'RESERVE') {
        await moveTo(link.id, await reserveOf(ownerId));
      } else if (choice === 'END') {
        await tx.linkSentinels.update({
          where: { id: link.id },
          data: { status: LinkStatus.REMOVED },
        });
      } else if (choice === 'CIRCLE') {
        await moveTo(link.id, circleId!);
      } else {
        kept.add(link.circleId);
      }
    }

    const groupIds = circles
      .filter((c) => c.circleType === CircleType.GROUP)
      .map((c) => c.id);
    if (groupIds.length) {
      await tx.sentinelGroupInvitation.updateMany({
        where: { groupRootId: { in: groupIds }, status: LinkStatus.PENDING },
        data: { status: LinkStatus.DECLINED },
      });
    }
    await tx.alertParticipant.updateMany({
      where: {
        alertId: tripId,
        status: { not: AlertParticipantStatus.CLOSED },
      },
      data: { status: AlertParticipantStatus.CLOSED, closedAt: now },
    });
    await tx.circle.updateMany({
      where: {
        id: { in: circles.filter((c) => !kept.has(c.id)).map((c) => c.id) },
      },
      data: { status: CircleStatus.CLOSED, closedAt: now },
    });
  }

  // ---- Helpers ----------------------------------------------------------------

  private async findRunningTrip(ownerId: string, tripId: string) {
    const trip = await this.prisma.alert.findFirst({
      where: {
        id: tripId,
        userCompanionId: ownerId,
        alertType: watchType('TRIP'),
        ...RUNNING_WATCH,
      },
      select: { id: true, label: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  // Another normal circle of the person: not the 1st (moving there needs
  // the Sentinel's consent), not the reserve, not a group, not this trip's.
  private async assertMoveTarget(
    ownerId: string,
    tripId: string,
    circleId: string,
  ) {
    const target = await this.prisma.circle.findFirst({
      where: {
        id: circleId,
        userCompanionId: ownerId,
        status: CircleStatus.ACTIVE,
        circleType: CircleType.BASIC,
        OR: [{ tripId: null }, { tripId: { not: tripId } }],
      },
    });
    if (!target) {
      throw new BadRequestException(
        'Choose one of your other circles (the 1st circle asks the Sentinel first)',
      );
    }
  }
}
