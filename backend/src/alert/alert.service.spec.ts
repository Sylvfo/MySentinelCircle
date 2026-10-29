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
  NotificationType,
} from '@prisma/client';
import { AlertService } from './alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';

describe('AlertService', () => {
  let service: AlertService;
  let prisma: {
    alert: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    circle: { findFirst: jest.Mock };
    linkSentinels: { findFirst: jest.Mock; findMany: jest.Mock };
    alertParticipant: {
      create: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    conversation: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    notification: { count: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let sms: { send: jest.Mock };
  let notifier: { notifyAlertChanged: jest.Mock; notifyNewMessage: jest.Mock };
  let notifications: { create: jest.Mock };

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
        count: jest.fn(),
      },
      circle: { findFirst: jest.fn() },
      linkSentinels: { findFirst: jest.fn(), findMany: jest.fn() },
      alertParticipant: {
        create: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      conversation: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      notification: { count: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    sms = { send: jest.fn() };
    notifier = { notifyAlertChanged: jest.fn(), notifyNewMessage: jest.fn() };
    notifications = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        { provide: PrismaService, useValue: prisma },
        { provide: SMS_SENDER, useValue: sms },
        { provide: REALTIME_NOTIFIER, useValue: notifier },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  describe('raiseAlert', () => {
    it('raises an alert when the companion raises it for themself', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: true }); // assertCanAffordAlert
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
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [
          { userSentinels: { userSentinelId: 'sentinel-1' } },
          { userSentinels: { userSentinelId: 'sentinel-2' } },
        ],
      }); // notifyAlertParticipants

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
          requestedById: 'alice-id', // the companion raised it themself
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
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'sentinel-1',
        'alert-1',
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'sentinel-2',
        'alert-1',
      );
      // Persisted notifications go to both sentinels, never to the
      // self-raising companion (actor === recipient is skipped).
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-1',
        type: NotificationType.ALERT_RAISED,
        actorUserId: 'alice-id',
        targetId: 'alert-1',
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-2',
        type: NotificationType.ALERT_RAISED,
        actorUserId: 'alice-id',
        targetId: 'alert-1',
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
        .mockResolvedValueOnce({ hasPaid: true }) // assertCanAffordAlert
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
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: true }); // assertCanAffordAlert
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
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: true }); // assertCanAffordAlert
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
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: true }); // assertCanAffordAlert
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

    it('allows an unpaid companion under the free lifetime trial limit', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: false });
      prisma.alert.count.mockResolvedValueOnce(2); // under FREE_ALERT_TRIAL_LIMIT (3)
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [],
      });

      await service.raiseAlert('alice-id', {
        companionId: 'alice-id',
        alertType: AlertType.BYCOMPANION,
        reason: 'x',
      });

      expect(prisma.alert.create).toHaveBeenCalled();
    });

    it('rejects raising past the free lifetime trial limit for an unpaid companion', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: false });
      prisma.alert.count.mockResolvedValueOnce(3); // FREE_ALERT_TRIAL_LIMIT reached

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('allows raising past the trial limit once the companion has paid', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ hasPaid: true });
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [],
      });

      await service.raiseAlert('alice-id', {
        companionId: 'alice-id',
        alertType: AlertType.BYCOMPANION,
        reason: 'x',
      });

      expect(prisma.alert.count).not.toHaveBeenCalled(); // hasPaid short-circuits the trial count
      expect(prisma.alert.create).toHaveBeenCalled();
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
      prisma.alert.findUnique
        .mockResolvedValueOnce(loadedAlert())
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [{ userSentinels: { userSentinelId: 'sentinel-1' } }],
        }); // notifyAlertParticipants
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
      // Notified, not the self-closing companion.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-1',
        type: NotificationType.ALERT_CLOSED,
        actorUserId: 'alice-id',
        targetId: 'alert-1',
      });
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

  describe('claimLead', () => {
    const leadParticipant = (overrides: Record<string, unknown> = {}) => ({
      id: 'participant-1',
      isLead: true,
      alert: { alertStatus: AlertStatus.ACTIVE },
      ...overrides,
    });

    it('sets leadAssignedAt and notifies the circle when a Lead claims leadership', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        leadParticipant(),
      );
      prisma.alert.findUnique
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [{ userSentinels: { userSentinelId: 'bob-id' } }],
        }) // notifyAlertParticipants
        .mockResolvedValueOnce({
          id: 'alert-1',
          userCompanionId: 'alice-id',
          firstCircleId: 'circle-1',
          participants: [],
        }); // getAlert
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' }); // getAlert's own permission check

      await service.claimLead('bob-id', 'alert-1');

      expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          alertId: 'alert-1',
          userSentinels: { userSentinelId: 'bob-id' },
        },
        include: { alert: { select: { alertStatus: true } } },
      });
      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: { leadAssignedAt: expect.any(Date) },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'alice-id',
        type: NotificationType.ALERT_LEAD_CLAIMED,
        actorUserId: 'bob-id',
        targetId: 'alert-1',
      });
    });

    it('lets a second Lead take over cleanly', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        leadParticipant({ id: 'participant-2' }),
      );
      prisma.alert.findUnique
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [],
        })
        .mockResolvedValueOnce({
          id: 'alert-1',
          userCompanionId: 'alice-id',
          firstCircleId: 'circle-1',
          participants: [],
        });
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });

      await service.claimLead('zoe-id', 'alert-1');

      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-2' },
        data: { leadAssignedAt: expect.any(Date) },
      });
    });

    it('rejects a caller who is not a Lead on this alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        leadParticipant({ isLead: false }),
      );

      await expect(service.claimLead('bob-id', 'alert-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });

    it('rejects a caller with no participation on this alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(service.claimLead('stranger-id', 'alert-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects claiming the lead on an already-resolved alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        leadParticipant({ alert: { alertStatus: AlertStatus.RESOLVED } }),
      );

      await expect(service.claimLead('bob-id', 'alert-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [{ userSentinels: { userSentinelId: 'neighbor-1' } }],
        }) // notifyAlertParticipants
        .mockResolvedValueOnce({ ...alertRow(), participants: [] }); // getAlert's final re-fetch
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([outerLink()]);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([]); // nobody contacted yet
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      const result = await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'Est-elle chez vous ?',
      });

      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'neighbor-1',
        'alert-1',
      );

      expect(result).toEqual({ ...alertRow(), participants: [], timeline: [] });
      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled(); // caller is the companion
      expect(prisma.alertParticipant.upsert).toHaveBeenCalledWith({
        where: {
          alertId_userSentinelsId: {
            alertId: 'alert-1',
            userSentinelsId: 'outer-link-1',
          },
        },
        update: expect.objectContaining({
          circleId: 'outer-1',
          circleName: 'Voisins',
          requestedById: 'alice-id',
        }),
        create: expect.objectContaining({
          alertId: 'alert-1',
          userSentinelsId: 'outer-link-1',
          circleId: 'outer-1',
          circleName: 'Voisins',
          requestedById: 'alice-id',
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
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'neighbor-1',
        type: NotificationType.ALERT_ESCALATED,
        actorUserId: 'alice-id',
        targetId: 'alert-1',
      });
    });

    it('does not re-bump an already-ACTIVE alert’s activatedAt', async () => {
      prisma.alert.findUnique
        .mockResolvedValueOnce(alertRow({ alertStatus: AlertStatus.ACTIVE }))
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [],
        }) // notifyAlertParticipants
        .mockResolvedValueOnce({
          ...alertRow({ alertStatus: AlertStatus.ACTIVE }),
          participants: [],
        });
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([outerLink()]);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([]);
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'x',
      });

      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('only contacts the first 2 of a 4-member circle, ordered by callOrder', async () => {
      const links = [
        outerLink({
          id: 'l-3',
          callOrder: 3,
          linkAsSentinel: { id: 's-3', phone: '+41790000003' },
        }),
        outerLink({
          id: 'l-1',
          callOrder: 1,
          linkAsSentinel: { id: 's-1', phone: '+41790000001' },
        }),
        outerLink({
          id: 'l-4',
          callOrder: 4,
          linkAsSentinel: { id: 's-4', phone: '+41790000004' },
        }),
        outerLink({
          id: 'l-2',
          callOrder: 2,
          linkAsSentinel: { id: 's-2', phone: '+41790000002' },
        }),
      ];
      prisma.alert.findUnique
        .mockResolvedValueOnce(alertRow())
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [],
        })
        .mockResolvedValueOnce({ ...alertRow(), participants: [] });
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce(links);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([]);
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'x',
      });

      expect(sms.send).toHaveBeenCalledTimes(2);
      expect(sms.send).toHaveBeenCalledWith('+41790000001', expect.any(String));
      expect(sms.send).toHaveBeenCalledWith('+41790000002', expect.any(String));
      expect(prisma.alertParticipant.updateMany).toHaveBeenCalledWith({
        where: { alertId: 'alert-1', userSentinelsId: { in: ['l-1', 'l-2'] } },
        data: expect.objectContaining({
          status: AlertParticipantStatus.CONTACTED,
        }),
      });
      // every accepted member still gets an AlertParticipant row (WAITING
      // for the ones not in this batch), not just the 2 contacted.
      expect(prisma.alertParticipant.upsert).toHaveBeenCalledTimes(4);
    });

    it('contacts the next 2 on a repeat call, leaving the first batch untouched', async () => {
      const links = [
        outerLink({
          id: 'l-1',
          callOrder: 1,
          linkAsSentinel: { id: 's-1', phone: '+41790000001' },
        }),
        outerLink({
          id: 'l-2',
          callOrder: 2,
          linkAsSentinel: { id: 's-2', phone: '+41790000002' },
        }),
        outerLink({
          id: 'l-3',
          callOrder: 3,
          linkAsSentinel: { id: 's-3', phone: '+41790000003' },
        }),
        outerLink({
          id: 'l-4',
          callOrder: 4,
          linkAsSentinel: { id: 's-4', phone: '+41790000004' },
        }),
      ];
      prisma.alert.findUnique
        .mockResolvedValueOnce(alertRow({ alertStatus: AlertStatus.ACTIVE }))
        .mockResolvedValueOnce({
          userCompanionId: 'alice-id',
          participants: [],
        })
        .mockResolvedValueOnce({
          ...alertRow({ alertStatus: AlertStatus.ACTIVE }),
          participants: [],
        });
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce(links);
      // l-1 and l-2 are already CONTACTED from a prior call; l-3/l-4 are WAITING.
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        { userSentinelsId: 'l-1', status: AlertParticipantStatus.CONTACTED },
        { userSentinelsId: 'l-2', status: AlertParticipantStatus.CONTACTED },
      ]);
      prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

      await service.requestCircle('alice-id', 'alert-1', {
        circleId: 'outer-1',
        question: 'x',
      });

      expect(sms.send).toHaveBeenCalledTimes(2);
      expect(sms.send).toHaveBeenCalledWith('+41790000003', expect.any(String));
      expect(sms.send).toHaveBeenCalledWith('+41790000004', expect.any(String));
      expect(prisma.alertParticipant.updateMany).toHaveBeenCalledWith({
        where: { alertId: 'alert-1', userSentinelsId: { in: ['l-3', 'l-4'] } },
        data: expect.objectContaining({
          status: AlertParticipantStatus.CONTACTED,
        }),
      });
      // l-1/l-2's upsert `update` branch must not touch status/response.
      expect(prisma.alertParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            alertId_userSentinelsId: {
              alertId: 'alert-1',
              userSentinelsId: 'l-1',
            },
          },
          update: expect.not.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('rejects a repeat call once every member has already been contacted', async () => {
      const links = [
        outerLink({ id: 'l-1', callOrder: 1 }),
        outerLink({ id: 'l-2', callOrder: 2 }),
      ];
      prisma.alert.findUnique.mockResolvedValueOnce(
        alertRow({ alertStatus: AlertStatus.ACTIVE }),
      );
      prisma.circle.findFirst.mockResolvedValueOnce(outerCircle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce(links);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        { userSentinelsId: 'l-1', status: AlertParticipantStatus.CONTACTED },
        { userSentinelsId: 'l-2', status: AlertParticipantStatus.RESPONDED },
      ]);

      await expect(
        service.requestCircle('alice-id', 'alert-1', {
          circleId: 'outer-1',
          question: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(sms.send).not.toHaveBeenCalled();
      expect(prisma.alertParticipant.upsert).not.toHaveBeenCalled();
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

  describe('remindStaleCircleBatches', () => {
    const staleParticipant = (overrides: Record<string, unknown> = {}) => ({
      alertId: 'alert-1',
      circleId: 'outer-1',
      contactedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5h ago
      alert: { firstCircleId: 'circle-1', userCompanionId: 'alice-id' },
      ...overrides,
    });

    it('reminds the 1st circle + companion once when a batch has gone stale', async () => {
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        staleParticipant(),
      ]);
      prisma.alertParticipant.count.mockResolvedValueOnce(1); // someone still WAITING
      prisma.notification.count.mockResolvedValueOnce(0); // not reminded yet
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { userSentinelId: 'bob-id' },
      ]);

      await service.remindStaleCircleBatches();

      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'alice-id',
        type: NotificationType.ALERT_CIRCLE_NO_RESPONSE,
        targetId: 'alert-1',
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'bob-id',
        type: NotificationType.ALERT_CIRCLE_NO_RESPONSE,
        targetId: 'alert-1',
      });
    });

    it('does not send a second reminder for the same stale batch', async () => {
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        staleParticipant(),
      ]);
      prisma.alertParticipant.count.mockResolvedValueOnce(1);
      prisma.notification.count.mockResolvedValueOnce(1); // already reminded

      await service.remindStaleCircleBatches();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('skips a stale batch with nobody left to contact', async () => {
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        staleParticipant(),
      ]);
      prisma.alertParticipant.count.mockResolvedValueOnce(0); // nobody WAITING

      await service.remindStaleCircleBatches();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('ignores a stale 1st-circle batch (never batched, no reminder needed)', async () => {
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        staleParticipant({ circleId: 'circle-1' }), // same as firstCircleId
      ]);

      await service.remindStaleCircleBatches();

      expect(prisma.alertParticipant.count).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateCircleChat', () => {
    const alertRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      alertStatus: AlertStatus.LAUNCHED,
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      ...overrides,
    });

    const outerParticipant = (overrides: Record<string, unknown> = {}) => ({
      id: 'participant-1',
      circleId: 'outer-1',
      firstCircleMessagingModeAtAlert: MessagingMode.INDIVIDUAL,
      ...overrides,
    });

    it('creates an isolated chat with the current 1st-circle roster when none exists yet', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        alertRow({ firstCircleId: 'circle-1' }),
      );
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        outerParticipant(),
      );
      prisma.conversation.findFirst.mockResolvedValueOnce(null);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([
        { userSentinels: { userSentinelId: 'sentinel-1' } },
        { userSentinels: { userSentinelId: 'sentinel-2' } },
      ]);
      prisma.conversation.create.mockResolvedValueOnce({
        id: 'conv-new',
        closedAt: null,
      });

      const result = await service.getOrCreateCircleChat(
        'neighbor-1',
        'alert-1',
      );

      expect(prisma.alertParticipant.findMany).toHaveBeenCalledWith({
        where: { alertId: 'alert-1', circleId: 'circle-1' },
        select: {
          userSentinels: { select: { userSentinelId: true } },
        },
      });
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          alertId: 'alert-1',
          participants: {
            create: [
              { userId: 'neighbor-1' },
              { userId: 'sentinel-1' },
              { userId: 'sentinel-2' },
            ],
          },
        },
        select: { id: true, closedAt: true },
      });
      expect(result).toEqual({ id: 'conv-new', closedAt: null });
    });

    it('returns the existing isolated chat on re-request instead of creating a new one', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        outerParticipant(),
      );
      prisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-existing',
        closedAt: null,
      });

      const result = await service.getOrCreateCircleChat(
        'neighbor-1',
        'alert-1',
      );

      expect(result).toEqual({ id: 'conv-existing', closedAt: null });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('rejects a 1st-circle member — they already have the main chat', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        alertRow({ firstCircleId: 'circle-1' }),
      );
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        outerParticipant({ circleId: 'circle-1' }),
      );

      await expect(
        service.getOrCreateCircleChat('lead-1', 'alert-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the link’s firstCircleMessagingModeAtAlert is NONE', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        outerParticipant({
          firstCircleMessagingModeAtAlert: MessagingMode.NONE,
        }),
      );

      await expect(
        service.getOrCreateCircleChat('neighbor-1', 'alert-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a caller with no participation on this alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getOrCreateCircleChat('stranger-1', 'alert-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects once the alert is resolved', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        alertRow({ alertStatus: AlertStatus.RESOLVED }),
      );

      await expect(
        service.getOrCreateCircleChat('neighbor-1', 'alert-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a missing alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getOrCreateCircleChat('neighbor-1', 'missing-alert'),
      ).rejects.toThrow(NotFoundException);
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
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [{ userSentinels: { userSentinelId: 'sentinel-1' } }],
      }); // notifyAlertParticipants's own lean select

      // Deliberately NOT mocking linkSentinels.findFirst here: respond()
      // must return the updated participant directly, never routing
      // through getAlert() — the caller may be an outer-circle Sentinel,
      // who getAlert()'s own "Me or 1st circle only" gate would otherwise
      // reject right after their response was already recorded.
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
      // Called exactly once, by notifyAlertParticipants's own lean select —
      // never by getAlert()'s heavier include (which respond() must never
      // route through).
      expect(prisma.alert.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.alert.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ userCompanionId: true }),
        }),
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'sentinel-1',
        'alert-1',
      );
      // The responding Sentinel isn't notified of their own response —
      // only the companion is.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'alice-id',
        type: NotificationType.ALERT_RESPONSE,
        actorUserId: 'sentinel-1',
        targetId: 'alert-1',
      });
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

  describe('getMyParticipation', () => {
    it('returns the caller’s own participation with minimal alert context, for any circle', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
        status: AlertParticipantStatus.CONTACTED,
        response: null,
        circleName: 'Voisins',
        isLead: false,
        alert: {
          id: 'alert-1',
          alertStatus: AlertStatus.ACTIVE,
          label: 'Recherche de Thomas',
          messageAlert: 'Introuvable',
          userCompanion: { firstName: 'Alice' },
        },
      });

      const result = await service.getMyParticipation('neighbor-1', 'alert-1');

      expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            alertId: 'alert-1',
            userSentinels: { userSentinelId: 'neighbor-1' },
          },
          include: {
            alert: {
              select: expect.objectContaining({
                label: true,
                messageAlert: true,
                statusByCompanion: true,
                statusByFirstCircle: true,
              }),
            },
          },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'participant-1',
          circleName: 'Voisins',
          alert: expect.objectContaining({
            label: 'Recherche de Thomas',
            messageAlert: 'Introuvable',
          }),
        }),
      );
    });

    it('rejects a caller with no participation on this alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getMyParticipation('stranger-id', 'alert-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    const alertRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      ...overrides,
    });

    it('sets statusByCompanion when the caller is the companion', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        statusByCompanion: 'Je vais bien, merci',
      });

      const result = await service.updateStatus('alice-id', 'alert-1', {
        message: 'Je vais bien, merci',
      });

      expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { statusByCompanion: 'Je vais bien, merci' },
      });
      expect(result).toEqual(
        expect.objectContaining({ statusByCompanion: 'Je vais bien, merci' }),
      );
    });

    it('sets statusByFirstCircle (and records who) when the caller is an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        statusByFirstCircle: 'On la cherche encore',
      });

      await service.updateStatus('sentinel-1', 'alert-1', {
        message: 'On la cherche encore',
      });

      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith({
        where: {
          userSentinelId: 'sentinel-1',
          circleId: 'circle-1',
          status: LinkStatus.ACCEPTED,
        },
      });
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          statusByFirstCircle: 'On la cherche encore',
          statusUpdatedById: 'sentinel-1',
          statusUpdatedAt: expect.any(Date),
        },
      });
    });

    it('stays writable on an already-resolved alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alert.update.mockResolvedValueOnce({ id: 'alert-1' });

      await expect(
        service.updateStatus('alice-id', 'alert-1', { message: 'Terminé' }),
      ).resolves.toBeDefined();
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateStatus('stranger-id', 'alert-1', { message: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('rejects a missing alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateStatus('alice-id', 'missing-alert', { message: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLabel', () => {
    const alertRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      ...overrides,
    });

    it('lets any accepted 1st-circle Sentinel rename the alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        label: 'Recherche de Thomas',
      });

      const result = await service.updateLabel('sentinel-1', 'alert-1', {
        label: 'Recherche de Thomas',
      });

      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith({
        where: {
          userSentinelId: 'sentinel-1',
          circleId: 'circle-1',
          status: LinkStatus.ACCEPTED,
        },
      });
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          label: 'Recherche de Thomas',
          labelUpdatedById: 'sentinel-1',
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({ label: 'Recherche de Thomas' }),
      );
    });

    it('rejects an outer-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateLabel('neighbor-1', 'alert-1', { label: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.update).not.toHaveBeenCalled();
    });

    it('rejects the companion — only the 1st circle can rename', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateLabel('alice-id', 'alert-1', { label: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a missing alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateLabel('lead-1', 'missing-alert', { label: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('tryHandleInboundSms', () => {
    it('records a matching reply, sends an acknowledgement, and pushes a live update', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
        alertId: 'alert-1',
        userSentinels: { userSentinelId: 'sentinel-1' },
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
      });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [{ userSentinels: { userSentinelId: 'sentinel-1' } }],
      }); // notifyAlertParticipants — SMS and in-app replies push alike

      const result = await service.tryHandleInboundSms(
        '+41793333333',
        'OUI je l’ai vue',
      );

      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'sentinel-1',
        'alert-1',
      );

      expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          status: AlertParticipantStatus.CONTACTED,
          userSentinels: { linkAsSentinel: { phone: '+41793333333' } },
          alert: { alertStatus: { not: AlertStatus.RESOLVED } },
        },
        orderBy: { contactedAt: 'desc' },
        include: { userSentinels: { select: { userSentinelId: true } } },
      });
      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          status: AlertParticipantStatus.RESPONDED,
          response: 'OUI je l’ai vue',
        }),
      });
      expect(sms.send).toHaveBeenCalledWith('+41793333333', expect.any(String));
      // The replying Sentinel (sentinel-1) isn't notified of their own
      // reply — only the companion is.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'alice-id',
        type: NotificationType.ALERT_RESPONSE,
        actorUserId: 'sentinel-1',
        targetId: 'alert-1',
      });
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

      expect(result).toEqual({ ...loadedAlert, timeline: [] });
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
            statusUpdatedBy: { select: { id: true, firstName: true } },
            labelUpdatedBy: { select: { id: true, firstName: true } },
            conversations: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                closedAt: true,
                messages: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });

    it('returns the alert for an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });

      const result = await service.getAlert('sentinel-1', 'alert-1');

      expect(result).toEqual({ ...loadedAlert, timeline: [] });
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

    it('builds a chronological timeline from raise, contact, response, lead-claim and close', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        id: 'alert-1',
        userCompanionId: 'alice-id',
        firstCircleId: 'circle-1',
        launchedAt: new Date('2026-01-01T08:00:00Z'),
        launchedBy: { firstName: 'Alice' },
        messageAlert: 'Not seen since yesterday',
        closedAt: new Date('2026-01-01T12:00:00Z'),
        closedBy: { firstName: 'Bob' },
        participants: [
          {
            contactedAt: new Date('2026-01-01T08:05:00Z'),
            answeredAt: new Date('2026-01-01T09:00:00Z'),
            leadAssignedAt: new Date('2026-01-01T08:10:00Z'),
            response: 'Saw her at the market at 8am',
            circleName: 'Premier cercle',
            userSentinels: { linkAsSentinel: { firstName: 'Bob' } },
          },
          {
            contactedAt: new Date('2026-01-01T10:00:00Z'),
            answeredAt: null,
            leadAssignedAt: null,
            response: null,
            circleName: 'Voisins',
            userSentinels: { linkAsSentinel: { firstName: 'Camille' } },
          },
        ],
      });

      const result = await service.getAlert('alice-id', 'alert-1');

      expect(
        result.timeline.map((e: { type: string; actorLabel: string }) => [
          e.type,
          e.actorLabel,
        ]),
      ).toEqual([
        ['ALERT_RAISED', 'Alice'],
        ['CONTACTED', 'Bob'],
        ['LEAD_CLAIMED', 'Bob'],
        ['RESPONDED', 'Bob'],
        ['CONTACTED', 'Camille'],
        ['ALERT_CLOSED', 'Bob'],
      ]);
      expect(result.timeline[0].detail).toBe('Not seen since yesterday');
      expect(result.timeline[1].detail).toBe('Premier cercle');
      expect(result.timeline[3].detail).toBe('Saw her at the market at 8am');
    });

    it('skips events with no timestamp and never throws on a bare-minimum alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        id: 'alert-1',
        userCompanionId: 'alice-id',
        firstCircleId: 'circle-1',
        launchedAt: null,
        launchedBy: null,
        closedAt: null,
        closedBy: null,
        participants: [
          {
            contactedAt: null,
            answeredAt: null,
            leadAssignedAt: null,
            response: null,
            circleName: 'Premier cercle',
            userSentinels: { linkAsSentinel: { firstName: 'Bob' } },
          },
        ],
      });

      const result = await service.getAlert('alice-id', 'alert-1');

      expect(result.timeline).toEqual([]);
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
