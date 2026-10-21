import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertParticipantStatus,
  AlertStatus,
  AlertType,
  CircleStatus,
  CircleType,
  LinkStatus,
  MessagingMode,
  SentinelType,
} from '@prisma/client';
import { AlertService } from './alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';

describe('AlertService', () => {
  let service: AlertService;
  let prisma: {
    alert: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    circle: { findFirst: jest.Mock };
    linkSentinels: { findFirst: jest.Mock; findMany: jest.Mock };
    alertParticipant: { create: jest.Mock; updateMany: jest.Mock };
    conversation: { create: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let sms: { send: jest.Mock };

  const circle = {
    id: 'circle-1',
    label: '1er cercle',
    circleType: CircleType.FIRST,
    status: CircleStatus.ACTIVE,
  };

  const linkRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'link-1',
    canSendPhone: true,
    canMessageOwnCircle: true,
    firstCircleMessagingMode: MessagingMode.GROUP,
    sentinelType: SentinelType.LEAD,
    linkAsSentinel: {
      id: 'sentinel-1',
      firstName: 'Bob',
      phone: '+41791111111',
    },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      alert: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      circle: { findFirst: jest.fn() },
      linkSentinels: { findFirst: jest.fn(), findMany: jest.fn() },
      alertParticipant: { create: jest.fn(), updateMany: jest.fn() },
      conversation: { create: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    sms = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        { provide: PrismaService, useValue: prisma },
        { provide: SMS_SENDER, useValue: sms },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  describe('raiseAlert', () => {
    it('raises an alert when the companion raises it for themself', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });

      const result = await service.raiseAlert('alice-id', {
        companionId: 'alice-id',
        alertType: AlertType.BYCOMPANION,
        reason: 'besoin d’aide',
      });

      expect(result).toEqual({ id: 'alert-1' });
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled(); // caller is the companion, no auth lookup needed
      expect(prisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alertStatus: AlertStatus.LAUNCHED,
          alertType: AlertType.BYCOMPANION,
          messageAlert: 'besoin d’aide',
          launchedById: 'alice-id',
          userCompanionId: 'alice-id',
          firstCircleId: 'circle-1',
        }),
      });
      expect(prisma.alertParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: AlertParticipantStatus.WAITING,
          circleId: 'circle-1',
          circleName: '1er cercle',
          canSendPhoneAtAlert: true,
          canMessageOwnCircleAtAlert: true,
          firstCircleMessagingModeAtAlert: MessagingMode.GROUP,
          isLead: true,
          alertId: 'alert-1',
          userSentinelsId: 'link-1',
        }),
      });
      expect(sms.send).toHaveBeenCalledTimes(1); // the sentinel only, not the companion
      expect(sms.send).toHaveBeenCalledWith('+41791111111', expect.any(String));
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          alertId: 'alert-1',
          participants: { create: [{ userId: 'sentinel-1' }] },
        },
      });
    });

    it('raises an alert when an accepted 1st-circle Sentinel raises it, and also notifies the companion', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' }); // assertCanRaise
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });

      await service.raiseAlert('sentinel-1', {
        companionId: 'alice-id',
        alertType: AlertType.NOCONTACT,
        reason: 'sans nouvelles',
      });

      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith({
        where: {
          userSentinelId: 'sentinel-1',
          circleId: 'circle-1',
          status: LinkStatus.ACCEPTED,
        },
      });
      expect(sms.send).toHaveBeenCalledTimes(2); // the circle + the companion
      expect(sms.send).toHaveBeenCalledWith('+41790000000', expect.any(String));
    });

    it('rejects when the caller is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.raiseAlert('stranger-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('rejects when the companion already has a non-resolved alert', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce({ id: 'existing-alert' });

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });
  });

  describe('closeAlert', () => {
    const loadedAlert = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      alertStatus: AlertStatus.LAUNCHED,
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      userCompanion: { firstName: 'Alice', phone: '+41790000000' },
      participants: [
        { userSentinels: { linkAsSentinel: { phone: '+41791111111' } } },
      ],
      ...overrides,
    });

    it('closes the alert when the companion closes it themself', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert());
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        alertStatus: AlertStatus.RESOLVED,
      });
      prisma.alertParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.closeAlert('alice-id', 'alert-1');

      expect(result).toEqual({
        id: 'alert-1',
        alertStatus: AlertStatus.RESOLVED,
      });
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          alertStatus: AlertStatus.RESOLVED,
          closedById: 'alice-id',
        }),
      });
      expect(sms.send).toHaveBeenCalledTimes(1); // the sentinel only, "Me" closed it themself
      expect(sms.send).toHaveBeenCalledWith('+41791111111', expect.any(String));
    });

    it('closes the alert when an accepted 1st-circle Sentinel closes it, and notifies the companion', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        alertStatus: AlertStatus.RESOLVED,
      });
      prisma.alertParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.closeAlert('sentinel-1', 'alert-1');

      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith({
        where: {
          userSentinelId: 'sentinel-1',
          circleId: 'circle-1',
          status: LinkStatus.ACCEPTED,
        },
      });
      expect(sms.send).toHaveBeenCalledTimes(2); // the circle + the companion
      expect(sms.send).toHaveBeenCalledWith('+41790000000', expect.any(String));
    });

    it('rejects when the caller is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.closeAlert('stranger-id', 'alert-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('rejects closing an already-resolved alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        loadedAlert({ alertStatus: AlertStatus.RESOLVED }),
      );

      await expect(service.closeAlert('alice-id', 'alert-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('rejects closing an alert that does not exist', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.closeAlert('alice-id', 'missing-alert'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAlert', () => {
    const loadedAlert = {
      id: 'alert-1',
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      participants: [],
    };

    it('returns the alert for the companion', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert);

      const result = await service.getAlert('alice-id', 'alert-1');

      expect(result).toEqual(loadedAlert);
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled();
    });

    it('returns the alert for an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });

      const result = await service.getAlert('sentinel-1', 'alert-1');

      expect(result).toEqual(loadedAlert);
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(service.getAlert('stranger-id', 'alert-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an alert that does not exist', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getAlert('alice-id', 'missing-alert'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMyAlerts', () => {
    it('lists alerts where the caller is the companion or a participant Sentinel', async () => {
      prisma.alert.findMany.mockResolvedValueOnce([{ id: 'alert-1' }]);

      const result = await service.listMyAlerts('alice-id');

      expect(result).toEqual([{ id: 'alert-1' }]);
      expect(prisma.alert.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { userCompanionId: 'alice-id' },
            {
              participants: {
                some: { userSentinels: { userSentinelId: 'alice-id' } },
              },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
