import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
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
  LeadSlot,
  LinkStatus,
  MessagingMode,
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
    alertParticipant: {
      create: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
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
    // isLead is driven by leadSlot, not sentinelType — SentinelType.LEAD is
    // never actually assigned anywhere in sentinel.service.ts.
    leadSlot: LeadSlot.LEAD_1,
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
      alertParticipant: {
        create: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
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
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        linkRow(),
        linkRow({
          id: 'link-2',
          leadSlot: null,
          linkAsSentinel: {
            id: 'sentinel-2',
            firstName: 'Cleo',
            phone: '+41792222222',
          },
        }),
      ]);
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
      // isLead is driven by leadSlot, not sentinelType.
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
      expect(prisma.alertParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isLead: false,
          userSentinelsId: 'link-2',
        }),
      });
      expect(sms.send).toHaveBeenCalledTimes(2); // both sentinels, not the companion
      expect(sms.send).toHaveBeenCalledWith('+41791111111', expect.any(String));
      expect(sms.send).toHaveBeenCalledWith('+41792222222', expect.any(String));
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          alertId: 'alert-1',
          participants: {
            create: [{ userId: 'sentinel-1' }, { userId: 'sentinel-2' }],
          },
        },
      });
    });

    it('raises an alert when any accepted Sentinel raises it (not necessarily 1st-circle), and also notifies the companion', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'outer-link',
      }); // assertCanRaise
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]); // the 1st circle's own accepted links
      prisma.user.findUnique
        .mockResolvedValueOnce({ firstName: 'Alice', phone: '+41790000000' }) // companion
        .mockResolvedValueOnce({ firstName: 'Dana' }); // the outer-circle raiser
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });

      await service.raiseAlert('outer-sentinel-id', {
        companionId: 'alice-id',
        alertType: AlertType.NOCONTACT,
        reason: 'sans nouvelles',
      });

      // No circleId in this query — an outer-circle Sentinel is authorized too.
      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith({
        where: {
          userSentinelId: 'outer-sentinel-id',
          userCompanionId: 'alice-id',
          status: LinkStatus.ACCEPTED,
        },
      });
      expect(sms.send).toHaveBeenCalledTimes(2); // the 1st circle + the companion
      expect(sms.send).toHaveBeenCalledWith('+41790000000', expect.any(String));
    });

    it('rejects when the caller has no accepted Sentinel link to the companion at all', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]); // lead-check passes
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null); // assertCanRaise

      await expect(
        service.raiseAlert('stranger-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('rejects raising when the companion has no 1st circle yet', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.linkSentinels.findMany).not.toHaveBeenCalled();
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('rejects raising when the 1st circle exists but has no accepted Lead Sentinel', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        linkRow({ leadSlot: null }),
      ]);

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ConflictException);
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

  describe('requestCircle', () => {
    const alertRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      alertStatus: AlertStatus.LAUNCHED,
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      ...overrides,
    });

    const outerCircle = {
      id: 'outer-1',
      label: 'Voisins',
      userCompanionId: 'alice-id',
      circleType: CircleType.BASIC,
      status: CircleStatus.ACTIVE,
    };

    const outerLink = (overrides: Record<string, unknown> = {}) => ({
      id: 'outer-link-1',
      canSendPhone: true,
      canMessageOwnCircle: true,
      firstCircleMessagingMode: MessagingMode.NONE,
      leadSlot: null,
      linkAsSentinel: { id: 'neighbor-1', phone: '+41793333333' },
      ...overrides,
    });

    it('fans out to the chosen outer circle’s accepted Sentinels and activates the alert', async () => {
      prisma.alert.findUnique
        .mockResolvedValueOnce(alertRow()) // requestCircle's own lookup
        .mockResolvedValueOnce(alertRow()); // getAlert's final re-fetch
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([outerLink()]);
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      const result = await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'Est-elle chez vous ?',
      });

      expect(result).toEqual(alertRow());
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled(); // caller is the companion
      expect(prisma.alertParticipant.upsert).toHaveBeenCalledWith({
        where: {
          alertId_userSentinelsId: {
            alertId: 'alert-1',
            userSentinelsId: 'outer-link-1',
          },
        },
        update: expect.objectContaining({
          status: AlertParticipantStatus.WAITING,
          circleId: 'outer-1',
          circleName: 'Voisins',
        }),
        create: expect.objectContaining({
          alertId: 'alert-1',
          userSentinelsId: 'outer-link-1',
          circleId: 'outer-1',
          circleName: 'Voisins',
        }),
      });
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({ alertStatus: AlertStatus.ACTIVE }),
      });
      expect(sms.send).toHaveBeenCalledWith('+41793333333', expect.any(String));
      expect(prisma.alertParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          alertId: 'alert-1',
          userSentinelsId: { in: ['outer-link-1'] },
        },
        data: expect.objectContaining({
          status: AlertParticipantStatus.CONTACTED,
        }),
      });
    });

    it('does not re-bump an already-ACTIVE alert’s activatedAt', async () => {
      prisma.alert.findUnique
        .mockResolvedValueOnce(alertRow({ alertStatus: AlertStatus.ACTIVE }))
        .mockResolvedValueOnce(alertRow({ alertStatus: AlertStatus.ACTIVE }));
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([outerLink()]);
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'x',
      });

      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('rejects targeting a circle that is not a BASIC circle of this companion', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.circle.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.requestCircle('alice-id', 'alert-1', {
          circleId: 'first-circle',
          question: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.alertParticipant.upsert).not.toHaveBeenCalled();
    });

    it('rejects when the target circle has no accepted Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]);

      await expect(
        service.requestCircle('alice-id', 'alert-1', {
          circleId: 'outer-1',
          question: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects escalating an already-resolved alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        alertRow({ alertStatus: AlertStatus.RESOLVED }),
      );

      await expect(
        service.requestCircle('alice-id', 'alert-1', {
          circleId: 'outer-1',
          question: 'x',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.requestCircle('stranger-id', 'alert-1', {
          circleId: 'outer-1',
          question: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('respond', () => {
    it('records an in-app yes/no reply for a Sentinel still awaiting an answer', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
        status: AlertParticipantStatus.RESPONDED,
        response: 'OUI',
      });

      // Deliberately NOT mocking prisma.alert.findUnique/linkSentinels.findFirst
      // here: respond() must return the updated participant directly, never
      // routing through getAlert() — the caller may be an outer-circle
      // Sentinel, who getAlert()'s own "Me or 1st circle only" gate would
      // otherwise reject right after their response was already recorded.
      const result = await service.respond('sentinel-1', 'alert-1', {
        accepted: true,
      });

      expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          alertId: 'alert-1',
          status: AlertParticipantStatus.CONTACTED,
          userSentinels: { userSentinelId: 'sentinel-1' },
        },
      });
      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          status: AlertParticipantStatus.RESPONDED,
          response: 'OUI',
        }),
      });
      expect(prisma.alert.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'participant-1',
        status: AlertParticipantStatus.RESPONDED,
        response: 'OUI',
      });
    });

    it('rejects when the caller has no pending request on this alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.respond('sentinel-1', 'alert-1', { accepted: false }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });
  });

  describe('tryHandleInboundSms', () => {
    it('records a matching reply and sends an acknowledgement', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
      });

      const result = await service.tryHandleInboundSms(
        '+41793333333',
        'OUI je l’ai vue',
      );

      expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          status: AlertParticipantStatus.CONTACTED,
          userSentinels: { linkAsSentinel: { phone: '+41793333333' } },
          alert: { alertStatus: { not: AlertStatus.RESOLVED } },
        },
        orderBy: { contactedAt: 'desc' },
      });
      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          status: AlertParticipantStatus.RESPONDED,
          response: 'OUI je l’ai vue',
        }),
      });
      expect(sms.send).toHaveBeenCalledWith('+41793333333', expect.any(String));
      expect(result).toEqual({ matched: true, action: 'alert_confirmed' });
    });

    it('returns null without matching when the reply is not a recognizable OUI/NON', async () => {
      const result = await service.tryHandleInboundSms('+41793333333', 'allo?');

      expect(result).toBeNull();
      expect(prisma.alertParticipant.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when no alert ask is pending for this phone', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      const result = await service.tryHandleInboundSms('+41793333333', 'NON');

      expect(result).toBeNull();
      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe('getAlert', () => {
    const loadedAlert = {
      id: 'alert-1',
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      participants: [],
    };

    it('returns the alert for the companion, including the 1st-circle conversation', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert);

      const result = await service.getAlert('alice-id', 'alert-1');

      expect(result).toEqual(loadedAlert);
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            userCompanion: {
              select: {
                id: true,
                firstName: true,
                myCircles: expect.objectContaining({
                  select: { id: true, label: true },
                }),
              },
            },
            conversations: { select: { id: true, closedAt: true } },
          }),
        }),
      );
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
