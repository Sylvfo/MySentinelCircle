import { Test, TestingModule } from '@nestjs/testing';
import {
  AlertParticipantStatus,
  CircleStatus,
  CircleType,
  LinkStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { EndPlan, TravelCircleService } from './travel-circles.service';

const NOW = new Date('2026-11-10T13:00:00Z');

describe('TravelCircleService', () => {
  let service: TravelCircleService;
  let prisma: {
    alert: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    circle: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    linkSentinels: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    alertParticipant: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    sentinelGroupInvitation: { updateMany: jest.Mock };
  };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      alert: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'trip-1', label: 'Col du Lac' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Léa' }) },
      circle: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({ id: 'reserve-new' }),
        updateMany: jest.fn(),
      },
      linkSentinels: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      alertParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      sentinelGroupInvitation: { updateMany: jest.fn() },
    };
    notifications = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TravelCircleService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();
    service = module.get(TravelCircleService);
  });

  describe('createCircle', () => {
    it('numbers a new travel circle after the existing ones', async () => {
      await service.createCircle('lea', 'trip-1', {});

      expect(prisma.circle.create).toHaveBeenCalledWith({
        data: {
          label: 'Col du Lac 2',
          circleType: CircleType.BASIC,
          userCompanionId: 'lea',
          tripId: 'trip-1',
        },
      });
    });

    it('creates a travel group, and only on a running trip of theirs', async () => {
      prisma.circle.count.mockResolvedValueOnce(0);
      await service.createCircle('lea', 'trip-1', { group: true });
      expect(prisma.circle.create.mock.calls[0][0].data).toMatchObject({
        label: 'Groupe Col du Lac',
        circleType: CircleType.GROUP,
      });

      prisma.alert.findFirst.mockResolvedValueOnce(null);
      await expect(service.createCircle('bob', 'trip-1', {})).rejects.toThrow(
        'Trip not found',
      );
    });
  });

  describe('addTraveller', () => {
    const dto = { linkId: 'link-9', circleId: 'travel-1' };

    it('counts an existing Sentinel on the trip, and tells them', async () => {
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'travel-1',
        label: 'Cercle du voyage 1',
      });
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'link-9',
        userSentinelId: 'bob',
        canSendPhone: true,
        circle: { tripId: null },
      });

      await service.addTraveller('lea', 'trip-1', dto);

      expect(prisma.alertParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            alertId: 'trip-1',
            userSentinelsId: 'link-9',
            circleId: 'travel-1',
            status: AlertParticipantStatus.WAITING,
            isLead: false,
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'bob',
        type: NotificationType.TRAVEL_CIRCLE_ADDED,
        actorUserId: 'lea',
        actorLabel: 'Léa',
        targetId: 'trip-1',
      });
    });

    it('refuses someone already on the trip', async () => {
      prisma.circle.findFirst.mockResolvedValue({ id: 'travel-1', label: 'C' });
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'link-9',
        circle: { tripId: 'trip-1' },
      });
      await expect(service.addTraveller('lea', 'trip-1', dto)).rejects.toThrow(
        'Already in a travel circle of this trip',
      );

      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'link-9',
        circle: { tripId: null },
      });
      prisma.alertParticipant.findUnique.mockResolvedValueOnce({
        status: AlertParticipantStatus.WAITING,
      });
      await expect(service.addTraveller('lea', 'trip-1', dto)).rejects.toThrow(
        'Already on this trip',
      );
    });

    it('needs a travel circle of this trip', async () => {
      prisma.circle.findFirst.mockResolvedValueOnce(null);

      await expect(service.addTraveller('lea', 'trip-1', dto)).rejects.toThrow(
        'Not a travel circle of this trip',
      );
    });
  });

  describe('endPlan', () => {
    it('is the reserve for everyone by default', async () => {
      const plan = await service.endPlan('lea', 'trip-1', {});

      expect(plan.forAll).toBe('RESERVE');
      expect(plan.perPerson.size).toBe(0);
    });

    it('only takes people added for this trip, and normal circles to move to', async () => {
      prisma.linkSentinels.findMany.mockResolvedValue([{ id: 'link-1' }]);
      await expect(
        service.endPlan('lea', 'trip-1', {
          perPerson: [{ linkId: 'other', choice: 'END' }],
        }),
      ).rejects.toThrow('Not someone added for this trip');

      prisma.circle.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.endPlan('lea', 'trip-1', {
          perPerson: [
            { linkId: 'link-1', choice: 'CIRCLE', circleId: 'first' },
          ],
        }),
      ).rejects.toThrow('Choose one of your other circles');
    });
  });

  describe('endOfTrip', () => {
    const plan = (overrides: Partial<EndPlan> = {}): EndPlan => ({
      forAll: 'RESERVE',
      perPerson: new Map(),
      ...overrides,
    });
    const travelCircle = {
      id: 'travel-1',
      userCompanionId: 'lea',
      circleType: CircleType.BASIC,
    };
    const run = (p: EndPlan) =>
      service.endOfTrip(prisma as never, 'lea', 'trip-1', p, NOW);

    it('moves the people added for the trip to the reserve, and closes its circles', async () => {
      prisma.circle.findMany.mockResolvedValueOnce([travelCircle]);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          id: 'link-1',
          status: LinkStatus.ACCEPTED,
          circleId: 'travel-1',
          userCompanionId: 'lea',
        },
      ]);
      prisma.circle.findFirst.mockResolvedValueOnce({ id: 'reserve-lea' });

      await run(plan());

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: {
          circleId: 'reserve-lea',
          leadSlot: null,
          requestedAsLead: false,
        },
      });
      expect(prisma.alertParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          alertId: 'trip-1',
          status: { not: AlertParticipantStatus.CLOSED },
        },
        data: { status: AlertParticipantStatus.CLOSED, closedAt: NOW },
      });
      expect(prisma.circle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['travel-1'] } },
        data: { status: CircleStatus.CLOSED, closedAt: NOW },
      });
    });

    it('applies each person’s choice, keeping a circle someone stays in', async () => {
      prisma.circle.findMany.mockResolvedValueOnce([travelCircle]);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { id: 'keep', status: LinkStatus.ACCEPTED, circleId: 'travel-1' },
        { id: 'end', status: LinkStatus.ACCEPTED, circleId: 'travel-1' },
        { id: 'move', status: LinkStatus.ACCEPTED, circleId: 'travel-1' },
        { id: 'invited', status: LinkStatus.PENDING, circleId: 'travel-1' },
      ]);

      await run(
        plan({
          forAll: 'KEEP',
          perPerson: new Map([
            ['end', { choice: 'END' }],
            ['move', { choice: 'CIRCLE', circleId: 'sport' }],
          ]),
        }),
      );

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'end' },
        data: { status: LinkStatus.REMOVED },
      });
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'move' },
        data: { circleId: 'sport', leadSlot: null, requestedAsLead: false },
      });
      // An invitation nobody answered ends with the trip.
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'invited' },
        data: { status: LinkStatus.REMOVED },
      });
      expect(
        prisma.linkSentinels.update.mock.calls.some(
          ([arg]: [{ where: { id: string } }]) => arg.where.id === 'keep',
        ),
      ).toBe(false);
      expect(prisma.circle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [] } },
        data: { status: CircleStatus.CLOSED, closedAt: NOW },
      });
    });

    it('always closes a travel group, its other members keeping their links in their reserve', async () => {
      prisma.circle.findMany.mockResolvedValueOnce([
        {
          id: 'group-root',
          userCompanionId: 'lea',
          circleType: CircleType.GROUP,
        },
        {
          id: 'group-bob',
          userCompanionId: 'bob',
          circleType: CircleType.GROUP,
        },
      ]);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          id: 'carol-for-lea',
          status: LinkStatus.ACCEPTED,
          circleId: 'group-root',
          userCompanionId: 'lea',
        },
        {
          id: 'carol-for-bob',
          status: LinkStatus.ACCEPTED,
          circleId: 'group-bob',
          userCompanionId: 'bob',
        },
      ]);
      prisma.circle.findFirst
        .mockResolvedValueOnce({ id: 'reserve-lea' })
        .mockResolvedValueOnce(null); // Bob has no reserve yet.

      await run(plan({ forAll: 'KEEP' }));

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'carol-for-lea' },
        data: expect.objectContaining({ circleId: 'reserve-lea' }),
      });
      expect(prisma.circle.create).toHaveBeenCalledWith({
        data: {
          userCompanionId: 'bob',
          label: 'Sentinelles en réserve',
          circleType: CircleType.RESERVED,
        },
        select: { id: true },
      });
      expect(prisma.sentinelGroupInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          groupRootId: { in: ['group-root', 'group-bob'] },
          status: LinkStatus.PENDING,
        },
        data: { status: LinkStatus.DECLINED },
      });
      expect(prisma.circle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['group-root', 'group-bob'] } },
        data: { status: CircleStatus.CLOSED, closedAt: NOW },
      });
    });
  });
});
