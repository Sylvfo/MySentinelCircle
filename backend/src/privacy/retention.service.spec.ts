import { Test, TestingModule } from '@nestjs/testing';
import { AlertStatus, LinkStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RUNNING_ALERT } from '../common/running-alert';
import { RetentionService } from './retention.service';
import { stripPositions } from './redaction';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: {
    alert: { findMany: jest.Mock; update: jest.Mock };
    message: { updateMany: jest.Mock };
    travelCheckpoint: { updateMany: jest.Mock };
    notification: { deleteMany: jest.Mock };
    user: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    linkSentinels: { updateMany: jest.Mock };
    sentinelGroupInvitation: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  const now = new Date('2026-11-06T03:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);

  beforeEach(async () => {
    prisma = {
      alert: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      message: { updateMany: jest.fn() },
      travelCheckpoint: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      linkSentinels: { updateMany: jest.fn() },
      sentinelGroupInvitation: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(RetentionService);
  });

  describe('stripPositions', () => {
    it('replaces every position line and keeps the rest', () => {
      expect(
        stripPositions(
          'Je pars\nPosition partagée : https://maps/x\nPosition mise à jour (± 3 km) : https://maps/y',
        ),
      ).toBe('Je pars\nPosition supprimée\nPosition supprimée');
    });
  });

  describe('purgeWatchPositions', () => {
    it('erases step positions 30 days after the watch ended, never while its alert runs', async () => {
      prisma.travelCheckpoint.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.purgeWatchPositions(now)).resolves.toBe(2);

      expect(prisma.travelCheckpoint.updateMany).toHaveBeenCalledWith({
        where: {
          alert: {
            alertStatus: AlertStatus.SENT,
            closedAt: { lt: daysAgo(30) },
            tripAlerts: { none: { alertStatus: RUNNING_ALERT } },
          },
          OR: [
            { validatedLatitude: { not: null } },
            { validatedLongitude: { not: null } },
          ],
        },
        data: { validatedLatitude: null, validatedLongitude: null },
      });
    });
  });

  describe('purgePositions', () => {
    it('only looks at alerts resolved more than 30 days ago', async () => {
      await service.purgePositions(now);

      expect(prisma.alert.findMany).toHaveBeenCalledWith({
        where: {
          alertStatus: AlertStatus.RESOLVED,
          closedAt: { lt: daysAgo(30) },
          messageAlert: { contains: 'Position' },
        },
        select: { id: true, messageAlert: true },
      });
    });

    it('strips the position from the alert and from its chat', async () => {
      prisma.alert.findMany.mockResolvedValue([
        { id: 'a1', messageAlert: 'Aide\nPosition partagée : https://maps/x' },
        { id: 'a2', messageAlert: 'Position du soleil, rien à voir' },
      ]);

      await expect(service.purgePositions(now)).resolves.toBe(1);

      expect(prisma.alert.update).toHaveBeenCalledTimes(1);
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { messageAlert: 'Aide\nPosition supprimée' },
      });
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversation: {
            alert: {
              alertStatus: AlertStatus.RESOLVED,
              closedAt: { lt: daysAgo(30) },
            },
          },
          body: {
            startsWith: '📍 Position',
            not: '📍 Position supprimée',
          },
        },
        data: { body: '📍 Position supprimée' },
      });
    });
  });

  describe('purgeNotifications', () => {
    it('deletes notifications older than about 6 months', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 4 });

      await expect(service.purgeNotifications(now)).resolves.toBe(4);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: daysAgo(182) } },
      });
    });
  });

  describe('purgeUnclaimedStubs', () => {
    it('does nothing when no number qualifies', async () => {
      await expect(service.purgeUnclaimedStubs(now)).resolves.toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('only targets old numbers that never said yes nor made an account', async () => {
      await service.purgeUnclaimedStubs(now);

      const { where } = prisma.user.findMany.mock.calls[0][0];
      expect(where).toMatchObject({
        status: UserStatus.ACTIVE,
        userType: UserType.ONLY_SMS,
        createdAt: { lt: daysAgo(182) },
        phoneVerifiedAt: null,
        passwordHash: null,
        email: null,
        googleId: null,
        linksAsSentinel: {
          every: { status: { in: [LinkStatus.PENDING, LinkStatus.DECLINED] } },
        },
        myUserSentinels: { none: {} },
        sentMessages: { none: {} },
      });
    });

    it('wipes their number and name and withdraws pending invitations', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

      await expect(service.purgeUnclaimedStubs(now)).resolves.toBe(2);

      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: {
          userSentinelId: { in: ['s1', 's2'] },
          status: LinkStatus.PENDING,
        },
        data: { status: LinkStatus.REMOVED },
      });
      expect(prisma.sentinelGroupInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          invitedUserId: { in: ['s1', 's2'] },
          status: LinkStatus.PENDING,
        },
        data: { status: LinkStatus.REMOVED },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1', 's2'] } },
        data: expect.objectContaining({
          status: UserStatus.DELETED,
          firstName: 'Compte supprimé',
          phone: null,
        }),
      });
    });
  });

  describe('eraseStubIfUnused', () => {
    it('keeps a number that still has something going on', async () => {
      await expect(
        service.eraseStubIfUnused('+41790000000', now),
      ).resolves.toBe(false);

      const { where } = prisma.user.findFirst.mock.calls[0][0];
      expect(where).toMatchObject({
        phone: '+41790000000',
        userType: UserType.ONLY_SMS,
        passwordHash: null,
        linksAsSentinel: {
          none: { status: { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] } },
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('erases the number and name of a number with nothing left', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 's1' });

      await expect(
        service.eraseStubIfUnused('+41790000000', now),
      ).resolves.toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({
          status: UserStatus.DELETED,
          firstName: 'Compte supprimé',
          phone: null,
        }),
      });
    });
  });
});
