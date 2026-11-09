import { FREE_TRIAL_USED_UP, PAYMENT_NOT_AVAILABLE } from '../user/plan.util';
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
  NotificationType,
} from '@prisma/client';
import { AlertService } from './alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';

// A subscription that is still running.
const SUBSCRIBED = new Date('2999-01-01');

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
    alertQuestion: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    conversation: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    conversationParticipant: { create: jest.Mock };
    message: { create: jest.Mock };
    notification: { count: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
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
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
      alertQuestion: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      conversation: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      conversationParticipant: { create: jest.fn() },
      message: { create: jest.fn() },
      notification: { count: jest.fn() },
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
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

  describe('updateLocation', () => {
    const running = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      userCompanionId: 'alice-id',
      alertStatus: AlertStatus.LAUNCHED,
      messageAlert:
        'Je suis tombée\n\nPosition partagée (± 15 m) : https://www.google.com/maps/search/?api=1&query=1.00000,2.00000',
      conversations: [{ id: 'room-1', closedAt: null }],
      ...overrides,
    });

    it('replaces the position line and posts it in the 1st circle room', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(running());

      await service.updateLocation('alice-id', 'alert-1', {
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 12000,
      });

      const line =
        'Position mise à jour (approximative, ± 12 km) : https://www.google.com/maps/search/?api=1&query=46.50000,6.60000';
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { messageAlert: `Je suis tombée\n\n${line}` },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: 'room-1',
          senderId: 'alice-id',
          body: `📍 ${line}`,
        }),
      });
    });

    it('adds a position line when none was shared at launch', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        running({ messageAlert: 'Je suis tombée' }),
      );

      await service.updateLocation('alice-id', 'alert-1', {
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 1500,
      });

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          messageAlert:
            'Je suis tombée\n\nPosition mise à jour (approximative, ± 1.5 km) : https://www.google.com/maps/search/?api=1&query=46.50000,6.60000',
        },
      });
    });

    it('is only for the person the alert is about', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(running());
      await expect(
        service.updateLocation('bob-id', 'alert-1', {
          latitude: 1,
          longitude: 2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses on a closed alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(
        running({ alertStatus: AlertStatus.RESOLVED }),
      );
      await expect(
        service.updateLocation('alice-id', 'alert-1', {
          latitude: 1,
          longitude: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('raiseAlert', () => {
    it('adds the shared position to the alert message and the SMS', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' });
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED });
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
        phoneVerifiedAt: new Date(),
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [],
      });

      await service.raiseAlert('alice-id', {
        companionId: 'alice-id',
        alertType: AlertType.BYCOMPANION,
        reason: 'Je suis tombée',
        location: { latitude: 46.519654, longitude: 6.632273, accuracy: 14.6 },
      });

      const link =
        'https://www.google.com/maps/search/?api=1&query=46.51965,6.63227';
      expect(prisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageAlert: `Je suis tombée\n\nPosition partagée (± 15 m) : ${link}`,
        }),
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+41791111111',
        expect.stringContaining(`Sa position : ${link}`),
      );
    });

    it('accepts the position of someone on the spot raising an assistance alert, said as theirs', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link' }); // assertCanRaise
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique
        .mockResolvedValueOnce({ firstName: 'Bob' }) // the raiser, for the position line
        .mockResolvedValueOnce({ status: 'ACTIVE' })
        .mockResolvedValueOnce({ paidUntil: SUBSCRIBED })
        .mockResolvedValueOnce({ firstName: 'Alice', phone: '+41790000000' })
        .mockResolvedValueOnce({ firstName: 'Bob' });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });

      await service.raiseAlert('bob-id', {
        companionId: 'alice-id',
        alertType: AlertType.INCIDENT,
        reason: 'Elle est tombée',
        location: { latitude: 46.5, longitude: 6.6 },
      });

      const link =
        'https://www.google.com/maps/search/?api=1&query=46.50000,6.60000';
      expect(prisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageAlert: `Elle est tombée\n\nPosition partagée par Bob : ${link}`,
        }),
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+41791111111',
        expect.stringContaining(
          `Position de Bob (qui a lance l'alerte) : ${link}`,
        ),
      );
    });

    it('rejects a position sent by someone raising another kind of alert for another person', async () => {
      await expect(
        service.raiseAlert('bob-id', {
          companionId: 'alice-id',
          alertType: AlertType.NOCONTACT,
          reason: 'x',
          location: { latitude: 46.5, longitude: 6.6 },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('raises an alert when the companion raises it for themself', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED }); // assertCanAffordAlert
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
        phoneVerifiedAt: new Date(),
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
          isLead: true,
          // Lead 1 is the responsible Lead from the start — not a choice.
          leadAssignedAt: expect.any(Date),
          requestedById: 'alice-id', // the companion raised it themself
          alertId: 'alert-1',
          userSentinelsId: 'link-1',
        }),
      });
      expect(prisma.alertParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isLead: false,
          leadAssignedAt: null,
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
            create: [
              { userId: 'sentinel-1' },
              { userId: 'sentinel-2' },
              { userId: 'alice-id' }, // the companion writes in the room too
            ],
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
        .mockResolvedValueOnce({ status: 'ACTIVE' }) // assertCompanionNotDeceased
        .mockResolvedValueOnce({ paidUntil: SUBSCRIBED }) // assertCanAffordAlert
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

    describe('who can answer the alert', () => {
      const dto = {
        companionId: 'alice-id',
        alertType: AlertType.NOCONTACT,
        reason: 'sans nouvelles',
      };
      const arrange = (
        links: ReturnType<typeof linkRow>[],
        companion: { phone: string | null; phoneVerifiedAt: Date | null } = {
          phone: '+41790000000',
          phoneVerifiedAt: new Date(),
        },
      ) => {
        prisma.alert.findFirst.mockResolvedValueOnce(null);
        prisma.circle.findFirst.mockResolvedValueOnce(circle);
        prisma.linkSentinels.findMany.mockResolvedValueOnce(links);
        prisma.user.findUnique
          .mockResolvedValueOnce({ status: 'ACTIVE' })
          .mockResolvedValueOnce({ paidUntil: SUBSCRIBED })
          .mockResolvedValueOnce({ firstName: 'Alice', ...companion })
          .mockResolvedValue({ firstName: 'Dana' });
        prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });
      };
      const leadWithoutPhone = () =>
        linkRow({
          linkAsSentinel: {
            id: 'sentinel-1',
            firstName: 'Bea',
            phone: null,
          },
        });

      it('refuses your own alert without a verified phone', async () => {
        arrange([linkRow()], { phone: null, phoneVerifiedAt: null });

        await expect(service.raiseAlert('alice-id', dto)).rejects.toThrow(
          'Add and verify your phone number',
        );
      });

      it('refuses your own alert when no Lead has a phone', async () => {
        arrange([leadWithoutPhone()]);

        await expect(service.raiseAlert('alice-id', dto)).rejects.toThrow(
          'A Lead Sentinel with a phone number',
        );
      });

      it('refuses a plain Sentinel when no Lead has a phone', async () => {
        arrange([leadWithoutPhone()]);
        prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link' });

        await expect(
          service.raiseAlert('outer-sentinel-id', dto),
        ).rejects.toThrow('A Lead Sentinel with a phone number');
      });

      it('refuses a Lead with no other Sentinel to answer', async () => {
        arrange([linkRow()]);
        prisma.linkSentinels.findFirst
          .mockResolvedValueOnce({ id: 'link' })
          .mockResolvedValueOnce(null);

        await expect(service.raiseAlert('sentinel-1', dto)).rejects.toThrow(
          'another Sentinel',
        );
      });

      it('lets a Lead raise it when another Sentinel can answer', async () => {
        arrange([linkRow()]);
        prisma.linkSentinels.findFirst
          .mockResolvedValueOnce({ id: 'link' })
          .mockResolvedValueOnce({ id: 'other-link' });

        await expect(service.raiseAlert('sentinel-1', dto)).resolves.toEqual({
          id: 'alert-1',
        });
      });
    });

    it('rejects when the caller has no accepted Sentinel link to the companion at all', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED }); // assertCanAffordAlert
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
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED }); // assertCanAffordAlert
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
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED }); // assertCanAffordAlert
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

    it('rejects raising an alert for a deceased companion', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'DECEASED' }); // assertCompanionNotDeceased

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.findFirst).not.toHaveBeenCalled();
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('rejects when the companion already has a non-resolved alert', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
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
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: null });
      prisma.alert.count.mockResolvedValueOnce(0); // under FREE_ALERT_TRIAL_LIMIT (1)
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
        phoneVerifiedAt: new Date(),
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
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: null });
      prisma.alert.count.mockResolvedValueOnce(1); // FREE_ALERT_TRIAL_LIMIT reached

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
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }); // assertCompanionNotDeceased
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED });
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
        phoneVerifiedAt: new Date(),
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

      expect(prisma.alert.count).not.toHaveBeenCalled(); // a running subscription short-circuits the trial count
      expect(prisma.alert.create).toHaveBeenCalled();
    });

    it('refuses a subscription that has ended like no subscription', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' });
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({
        paidUntil: new Date('2000-01-01'),
      });
      prisma.alert.count.mockResolvedValueOnce(1);

      await expect(
        service.raiseAlert('alice-id', {
          companionId: 'alice-id',
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        }),
      ).rejects.toThrow(FREE_TRIAL_USED_UP);
    });

    describe('paying for this one alert', () => {
      const devRoutes = process.env.ALLOW_DEV_ROUTES;
      afterEach(() => {
        process.env.ALLOW_DEV_ROUTES = devRoutes;
      });

      it('records who paid when the payment goes through', async () => {
        process.env.ALLOW_DEV_ROUTES = 'true';
        prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' });
        prisma.alert.findFirst.mockResolvedValueOnce(null);
        prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: null });
        prisma.alert.count.mockResolvedValueOnce(1); // trial used
        prisma.circle.findFirst.mockResolvedValueOnce(circle);
        prisma.linkSentinels.findMany.mockResolvedValueOnce([linkRow()]);
        prisma.user.findUnique.mockResolvedValueOnce({
          firstName: 'Alice',
          phone: '+41790000000',
          phoneVerifiedAt: new Date(),
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
          payForThisAlert: true,
        });

        expect(prisma.alert.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ paidById: 'alice-id' }),
        });
      });

      it('refuses while online payment is not available', async () => {
        process.env.ALLOW_DEV_ROUTES = 'false';
        prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' });
        prisma.alert.findFirst.mockResolvedValueOnce(null);
        prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: null });
        prisma.alert.count.mockResolvedValueOnce(1);

        await expect(
          service.raiseAlert('alice-id', {
            companionId: 'alice-id',
            alertType: AlertType.BYCOMPANION,
            reason: 'x',
            payForThisAlert: true,
          }),
        ).rejects.toThrow(PAYMENT_NOT_AVAILABLE);
        expect(prisma.alert.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('closeAlert', () => {
    it('only sends the closing SMS to contacted outer-circle Sentinels', async () => {
      const participant = (
        phone: string,
        circleId: string,
        contactedAt: Date | null,
      ) => ({
        circleId,
        contactedAt,
        userSentinels: { linkAsSentinel: { phone } },
      });
      prisma.alert.findUnique
        .mockResolvedValueOnce({
          id: 'alert-1',
          alertStatus: AlertStatus.ACTIVE,
          userCompanionId: 'alice-id',
          firstCircleId: 'first-1',
          userCompanion: { firstName: 'Alice', phone: null },
          participants: [
            participant('+41790000001', 'first-1', new Date()),
            participant('+41790000002', 'voisins', new Date()),
            participant('+41790000003', 'voisins', null),
          ],
        })
        .mockResolvedValueOnce(null); // notifyAlertParticipants

      await service.closeAlert('alice-id', 'alert-1');

      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledWith('+41790000002', expect.any(String));
    });

    const loadedAlert = (overrides: Record<string, unknown> = {}) => ({
      id: 'alert-1',
      alertStatus: AlertStatus.LAUNCHED,
      userCompanionId: 'alice-id',
      firstCircleId: 'circle-1',
      userCompanion: { firstName: 'Alice', phone: '+41790000000' },
      participants: [
        {
          contactedAt: new Date(),
          userSentinels: { linkAsSentinel: { phone: '+41791111111' } },
        },
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

      const before = Date.now();
      const result = await service.closeAlert('alice-id', 'alert-1');

      expect(result).toEqual({
        id: 'alert-1',
        alertStatus: AlertStatus.RESOLVED,
      });
      // The chats stay writable 7 more days: closedAt = "writable until".
      const closingArgs = prisma.conversation.updateMany.mock.calls[0][0] as {
        data: { closedAt: Date };
      };
      const inDays =
        (closingArgs.data.closedAt.getTime() - before) / 86_400_000;
      expect(inDays).toBeGreaterThan(6.99);
      expect(inDays).toBeLessThan(7.01);
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

    it('sends the closing word: 1st-circle status, posted in the chats, in the SMS', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(loadedAlert());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
      prisma.alert.update.mockResolvedValueOnce({
        id: 'alert-1',
        alertStatus: AlertStatus.RESOLVED,
      });
      prisma.alertParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.conversation.findMany.mockResolvedValueOnce([
        { id: 'room-1' },
        { id: 'chat-1' },
      ]);

      await service.closeAlert(
        'sentinel-1',
        'alert-1',
        '  Tout va bien, merci à toutes et tous.  ',
      );

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          statusByFirstCircle: 'Tout va bien, merci à toutes et tous.',
          statusUpdatedById: 'sentinel-1',
        }),
      });
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'chat-1',
          senderId: 'sentinel-1',
          type: 'TEXT',
          body: 'Tout va bien, merci à toutes et tous.',
        },
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+41791111111',
        expect.stringContaining(': Tout va bien, merci à toutes et tous.'),
      );
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

    it('rejects a Lead who already left the alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        leadParticipant({ status: AlertParticipantStatus.CLOSED }),
      );

      await expect(service.claimLead('bob-id', 'alert-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });
  });

  describe('leaveAlert', () => {
    const participant = (overrides: Record<string, unknown> = {}) => ({
      id: 'participant-1',
      isLead: false,
      status: AlertParticipantStatus.RESPONDED,
      leadAssignedAt: null,
      alert: { alertStatus: AlertStatus.ACTIVE },
      ...overrides,
    });

    beforeEach(() => {
      prisma.alert.findUnique.mockResolvedValue({
        userCompanionId: 'alice-id',
        participants: [],
      }); // notifyAlertParticipants
    });

    it('closes a plain Sentinel’s participation and pings the alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(participant());

      await service.leaveAlert('bob-id', 'alert-1');

      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: {
          status: AlertParticipantStatus.CLOSED,
          closedAt: expect.any(Date),
        },
      });
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
    });

    it('lets a Lead leave once another Lead claimed the alert after them', async () => {
      const claimedAt = new Date('2026-11-01T10:00:00Z');
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        participant({ isLead: true, leadAssignedAt: claimedAt }),
      );
      prisma.alertParticipant.count.mockResolvedValueOnce(1);

      await service.leaveAlert('bob-id', 'alert-1');

      expect(prisma.alertParticipant.count).toHaveBeenCalledWith({
        where: {
          alertId: 'alert-1',
          id: { not: 'participant-1' },
          isLead: true,
          status: { not: AlertParticipantStatus.CLOSED },
          leadAssignedAt: { gt: claimedAt },
        },
      });
      expect(prisma.alertParticipant.update).toHaveBeenCalled();
    });

    it('refuses a Lead nobody has taken over from', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        participant({ isLead: true }),
      );
      prisma.alertParticipant.count.mockResolvedValueOnce(0);

      await expect(service.leaveAlert('bob-id', 'alert-1')).rejects.toThrow(
        'Another Lead must take the lead before you leave this alert',
      );
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });

    it('rejects leaving twice', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        participant({ status: AlertParticipantStatus.CLOSED }),
      );

      await expect(service.leaveAlert('bob-id', 'alert-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects leaving a resolved alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        participant({ alert: { alertStatus: AlertStatus.RESOLVED } }),
      );

      await expect(service.leaveAlert('bob-id', 'alert-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a caller with no participation (e.g. the companion)', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(service.leaveAlert('alice-id', 'alert-1')).rejects.toThrow(
        NotFoundException,
      );
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
      alertChatWithFirstCircle: true,
      userCompanion: { alertChatWithFirstCircle: true },
    };

    const outerLink = (overrides: Record<string, unknown> = {}) => ({
      id: 'outer-link-1',
      canSendPhone: true,
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
        questionKind: 'CAN_VISIT',
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
          alertChatWithFirstCircleAtAlert: true,
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

    it.each([
      ['the companion’s general switch is off', false, true],
      ['the circle’s own setting is off', true, false],
    ])(
      'freezes no 1st-circle chat when %s',
      async (_label, userSwitch, circleSwitch) => {
        prisma.alert.findUnique
          .mockResolvedValueOnce(alertRow())
          .mockResolvedValueOnce({
            userCompanionId: 'alice-id',
            participants: [],
          })
          .mockResolvedValueOnce({ ...alertRow(), participants: [] });
        prisma.circle.findFirst.mockResolvedValueOnce({
          ...outerCircle,
          alertChatWithFirstCircle: circleSwitch,
          userCompanion: { alertChatWithFirstCircle: userSwitch },
        });
        prisma.linkSentinels.findMany.mockResolvedValueOnce([outerLink()]);
        prisma.alertParticipant.findMany.mockResolvedValueOnce([]);
        prisma.user.findUnique.mockResolvedValueOnce({ firstName: 'Alice' });

        await service.requestCircle('alice-id', 'alert-1', {
          circleId: 'outer-1',
          questionKind: 'CAN_VISIT',
        });

        expect(prisma.alertParticipant.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              alertChatWithFirstCircleAtAlert: false,
            }),
          }),
        );
      },
    );

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
        questionKind: 'CAN_VISIT',
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
        questionKind: 'CAN_VISIT',
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
        questionKind: 'CAN_VISIT',
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
          questionKind: 'CAN_VISIT',
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
          questionKind: 'CAN_VISIT',
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
          questionKind: 'CAN_VISIT',
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
          questionKind: 'CAN_VISIT',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.requestCircle('stranger-id', 'alert-1', {
          circleId: 'outer-1',
          questionKind: 'CAN_VISIT',
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
      alertChatWithFirstCircleAtAlert: true,
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
              { userId: 'alice-id' }, // the companion writes here too
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

    it('rejects when the circle was not allowed to chat with the 1st circle', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(alertRow());
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(
        outerParticipant({
          alertChatWithFirstCircleAtAlert: false,
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
    it("refuses to change a 1st-circle reply once it is I'm going", async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        circleId: 'first-1',
        alert: { firstCircleId: 'first-1' },
        questions: [],
        id: 'participant-1',
        response: 'GOING',
      });

      await expect(
        service.respond('sentinel-1', 'alert-1', { reply: 'LATER' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });

    it('lets a 1st-circle Later reply become Going', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        circleId: 'first-1',
        alert: { firstCircleId: 'first-1' },
        questions: [],
        id: 'participant-1',
        response: 'LATER',
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
        response: 'GOING',
      });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [],
      });

      await service.respond('sentinel-1', 'alert-1', { reply: 'GOING' });

      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({ response: 'GOING' }),
      });
    });

    it('records an in-app reply of the 1st circle', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        circleId: 'first-1',
        alert: { firstCircleId: 'first-1' },
        questions: [],
        id: 'participant-1',
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
        status: AlertParticipantStatus.RESPONDED,
        response: 'GOING',
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
        reply: 'GOING',
      });

      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          status: AlertParticipantStatus.RESPONDED,
          response: 'GOING',
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
        response: 'GOING',
      });
    });

    it('lets an outer-circle Sentinel answer a question and change their mind', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
        status: AlertParticipantStatus.RESPONDED,
        circleId: 'voisins',
        alert: { firstCircleId: 'first-1' },
        questions: [{ id: 'question-1', kind: 'CAN_VISIT' }],
      });
      prisma.alertParticipant.update.mockResolvedValueOnce({ id: 'p' });

      await service.respond('sentinel-1', 'alert-1', {
        reply: 'LATER',
        questionId: 'question-1',
      });

      expect(prisma.alertQuestion.update).toHaveBeenCalledWith({
        where: { id: 'question-1' },
        data: expect.objectContaining({ response: 'LATER' }),
      });
    });

    it('rejects a reply outside the list of the question', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
        circleId: 'voisins',
        alert: { firstCircleId: 'first-1' },
        questions: [{ id: 'question-1', kind: 'CAN_VISIT' }],
      });

      await expect(
        service.respond('sentinel-1', 'alert-1', {
          reply: 'TODAY',
          questionId: 'question-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
    });

    it('rejects an outer-circle reply without a known question', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce({
        id: 'participant-1',
        circleId: 'voisins',
        alert: { firstCircleId: 'first-1' },
        questions: [],
      });

      await expect(
        service.respond('sentinel-1', 'alert-1', { reply: 'YES' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the caller has no pending request on this alert', async () => {
      prisma.alertParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.respond('sentinel-1', 'alert-1', { reply: 'GOING' }),
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
        questions: [],
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
            questions: { orderBy: { createdAt: 'asc' } },
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

  describe('askQuestion', () => {
    const open = {
      id: 'alert-1',
      alertStatus: AlertStatus.ACTIVE,
      userCompanionId: 'alice-id',
      firstCircleId: 'first-1',
    };

    it('refuses someone who was never contacted', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce(open);
      prisma.alertParticipant.findMany.mockResolvedValueOnce([]);

      await expect(
        service.askQuestion('alice-id', 'alert-1', {
          questionKind: 'SEEMED_OK',
          participantIds: ['participant-1'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.alertQuestion.createMany).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('refuses a closed alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        ...open,
        alertStatus: AlertStatus.RESOLVED,
      });

      await expect(
        service.askQuestion('alice-id', 'alert-1', {
          questionKind: 'SEEMED_OK',
          participantIds: ['participant-1'],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('sends a further question to someone who already answered', async () => {
      prisma.alert.findUnique
        .mockResolvedValueOnce(open)
        .mockResolvedValueOnce(null) // notifyAlertParticipants
        .mockResolvedValueOnce(null); // getAlert, stubbed below
      prisma.alertParticipant.findMany
        .mockResolvedValueOnce([
          {
            id: 'participant-1',
            userSentinels: {
              id: 'link-1',
              linkAsSentinel: { phone: '+41793333333' },
            },
          },
        ])
        .mockResolvedValueOnce([{ id: 'participant-1' }]);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Marc',
        lastName: 'Dupont',
      });
      const getAlert = jest
        .spyOn(service, 'getAlert')
        .mockResolvedValueOnce({} as never);

      await service.askQuestion('alice-id', 'alert-1', {
        questionKind: 'WHERE_SEEN',
        participantIds: ['participant-1'],
      });

      expect(prisma.alertQuestion.createMany).toHaveBeenCalledWith({
        data: [
          {
            kind: 'WHERE_SEEN',
            askedById: 'alice-id',
            alertParticipantId: 'participant-1',
          },
        ],
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+41793333333',
        expect.stringContaining('alerte Marc Dupont'),
      );
      expect(getAlert).toHaveBeenCalled();
    });
  });

  describe('answerQuestion', () => {
    const question = (kind: string) => ({
      id: 'question-1',
      kind,
      alertParticipant: {
        id: 'participant-1',
        alertId: 'alert-1',
        userSentinels: { userSentinelId: 'sentinel-1' },
        alert: { userCompanion: { firstName: 'Marc' } },
      },
    });

    it('records the answer to the last question and pushes a live update', async () => {
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
      });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [{ userSentinels: { userSentinelId: 'sentinel-1' } }],
      }); // notifyAlertParticipants — SMS and in-app replies push alike

      const result = await service.answerQuestion(
        question('CAN_VISIT') as never,
        '+41793333333',
        '2',
      );

      expect(prisma.alertParticipant.update).toHaveBeenCalledWith({
        where: { id: 'participant-1' },
        data: expect.objectContaining({
          status: AlertParticipantStatus.RESPONDED,
          response: 'LATER',
        }),
      });
      expect(prisma.alertQuestion.update).toHaveBeenCalledWith({
        where: { id: 'question-1' },
        data: expect.objectContaining({ response: 'LATER' }),
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+41793333333',
        expect.stringContaining('note pour Marc'),
      );
      expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
        'alice-id',
        'alert-1',
      );
      // The replying Sentinel isn't notified of their own reply.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ matched: true, action: 'alert_replied' });
    });

    it('stores a free text for WHERE_SEEN', async () => {
      prisma.alertParticipant.update.mockResolvedValueOnce({
        id: 'participant-1',
      });
      prisma.alert.findUnique.mockResolvedValueOnce(null);

      await service.answerQuestion(
        question('WHERE_SEEN') as never,
        '+41793333333',
        'a la gare',
      );

      expect(prisma.alertQuestion.update).toHaveBeenCalledWith({
        where: { id: 'question-1' },
        data: expect.objectContaining({ response: 'a la gare' }),
      });
    });

    it('asks again when the reply is not understood, recording nothing', async () => {
      const result = await service.answerQuestion(
        question('CAN_VISIT') as never,
        '+41793333333',
        'hein',
      );

      expect(prisma.alertParticipant.update).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledWith(
        '+41793333333',
        expect.stringContaining('1 Oui, 2 Plus tard, 3 Non'),
      );
      expect(result).toEqual({
        matched: true,
        action: 'alert_reply_not_understood',
      });
    });
  });

  describe('listOpenQuestionsByPhone', () => {
    const question = (id: string, alertId: string) => ({
      id,
      alertParticipant: { alertId },
    });

    it('keeps the latest question of each open alert', async () => {
      prisma.alertQuestion.findMany.mockResolvedValueOnce([
        question('q3', 'alert-2'),
        question('q2', 'alert-1'),
        question('q1', 'alert-1'),
      ]);

      const questions = await service.listOpenQuestionsByPhone('+41793333333');

      expect(questions.map((q) => q.id)).toEqual(['q3', 'q2']);
      expect(prisma.alertQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            alertParticipant: expect.objectContaining({
              alert: { alertStatus: { not: AlertStatus.RESOLVED } },
            }),
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
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
                gender: true,
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

    it('seats the companion in the 1st circle room of their running alert', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        ...loadedAlert,
        alertStatus: AlertStatus.LAUNCHED,
        userCompanion: { id: 'alice-id', firstName: 'Alice' },
        conversations: [
          {
            id: 'room-1',
            closedAt: null,
            participants: [{ user: { id: 'sentinel-1', firstName: 'Bob' } }],
          },
        ],
      });

      const result = await service.getAlert('alice-id', 'alert-1');

      expect(prisma.conversationParticipant.create).toHaveBeenCalledWith({
        data: { conversationId: 'room-1', userId: 'alice-id' },
      });
      expect(result.conversations[0].participants).toContainEqual({
        user: { id: 'alice-id', firstName: 'Alice' },
      });
    });

    it('does not seat the companion again when already in the room', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        ...loadedAlert,
        alertStatus: AlertStatus.LAUNCHED,
        userCompanion: { id: 'alice-id', firstName: 'Alice' },
        conversations: [
          {
            id: 'room-1',
            closedAt: null,
            participants: [{ user: { id: 'alice-id', firstName: 'Alice' } }],
          },
        ],
      });

      await service.getAlert('alice-id', 'alert-1');

      expect(prisma.conversationParticipant.create).not.toHaveBeenCalled();
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
      prisma.alert.findMany.mockResolvedValueOnce([
        { id: 'alert-1', participants: [] },
        {
          id: 'alert-2',
          participants: [
            { status: AlertParticipantStatus.CONTACTED, circleId: 'circle-2' },
          ],
        },
      ]);

      const result = await service.listMyAlerts('alice-id');

      expect(result).toEqual([
        { id: 'alert-1', myParticipation: null },
        {
          id: 'alert-2',
          myParticipation: {
            status: AlertParticipantStatus.CONTACTED,
            circleId: 'circle-2',
          },
        },
      ]);
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
        include: {
          participants: {
            where: { userSentinels: { userSentinelId: 'alice-id' } },
            select: { status: true, circleId: true },
          },
          userCompanion: {
            select: { firstName: true, lastName: true, gender: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('pause', () => {
    // Mocks for a full raiseAlert by the companion themself, up to the end.
    const mockRaise = (
      links: unknown[],
      companionGuard: Record<string, unknown> = { status: 'ACTIVE' },
    ) => {
      prisma.user.findUnique.mockResolvedValueOnce(companionGuard); // assertCompanionCanBeAlerted
      prisma.alert.findFirst.mockResolvedValueOnce(null); // assertNoActiveAlert
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED }); // assertCanAffordAlert
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce(links);
      prisma.user.findUnique.mockResolvedValueOnce({
        firstName: 'Alice',
        phone: '+41790000000',
        phoneVerifiedAt: new Date(),
      });
      prisma.alert.create.mockResolvedValueOnce({ id: 'alert-1' });
      prisma.alert.findUnique.mockResolvedValueOnce({
        userCompanionId: 'alice-id',
        participants: [],
      }); // notifyAlertParticipants
    };
    const raiseForSelf = () =>
      service.raiseAlert('alice-id', {
        companionId: 'alice-id',
        alertType: AlertType.BYCOMPANION,
        reason: 'x',
      });
    const pausedLink = (overrides: Record<string, unknown> = {}) =>
      linkRow({
        id: 'link-2',
        leadSlot: null,
        linkAsSentinel: {
          id: 'sentinel-2',
          firstName: 'Cleo',
          phone: '+41792222222',
          pausedForOthers: true,
        },
        ...overrides,
      });

    it('refuses an alert raised by someone else about a person paused for me', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        status: 'ACTIVE',
        pausedForMe: true,
      });
      await expect(
        service.raiseAlert('bob-id', {
          companionId: 'alice-id',
          alertType: AlertType.NOCONTACT,
          reason: 'x',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('still lets a person paused for me raise an alert about themself', async () => {
      mockRaise([linkRow()], { status: 'ACTIVE', pausedForMe: true });
      await expect(raiseForSelf()).resolves.toEqual({ id: 'alert-1' });
    });

    it('leaves a 1st-circle Sentinel paused for others out of the alert', async () => {
      mockRaise([linkRow(), pausedLink()]);

      await raiseForSelf();

      expect(prisma.alertParticipant.create).toHaveBeenCalledTimes(1);
      expect(prisma.alertParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userSentinelsId: 'link-1' }),
      });
      expect(sms.send).not.toHaveBeenCalledWith(
        '+41792222222',
        expect.anything(),
      );
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          participants: {
            create: [{ userId: 'sentinel-1' }, { userId: 'alice-id' }],
          },
        }),
      });
    });

    it('refuses the alert when every Lead of the 1st circle is paused', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' });
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ paidUntil: SUBSCRIBED });
      prisma.circle.findFirst.mockResolvedValueOnce(circle);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        pausedLink({ id: 'link-1', leadSlot: LeadSlot.LEAD_1 }),
      ]);

      await expect(raiseForSelf()).rejects.toThrow(
        /Every Lead Sentinel of this 1st circle is on pause/,
      );
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('never asks an outer-circle Sentinel paused for others', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        id: 'alert-1',
        alertStatus: AlertStatus.LAUNCHED,
        userCompanionId: 'alice-id',
        firstCircleId: 'circle-1',
      });
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'outer-1',
        label: 'Voisins',
        alertChatWithFirstCircle: true,
        userCompanion: { alertChatWithFirstCircle: true },
      });
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]); // everyone paused

      await expect(
        service.requestCircle('alice-id', 'alert-1', {
          circleId: 'outer-1',
          questionKind: 'CAN_VISIT',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.linkSentinels.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            linkAsSentinel: { pausedForOthers: false },
          }),
        }),
      );
    });

    it('only re-asks outer-circle Sentinels who are not on pause', async () => {
      prisma.alert.findUnique.mockResolvedValueOnce({
        id: 'alert-1',
        alertStatus: AlertStatus.ACTIVE,
        userCompanionId: 'alice-id',
        firstCircleId: 'circle-1',
      });
      prisma.alertParticipant.findMany.mockResolvedValueOnce([]); // the one asked is paused

      await expect(
        service.askQuestion('alice-id', 'alert-1', {
          participantIds: ['p-1'],
          questionKind: 'CAN_VISIT',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.alertParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userSentinels: { linkAsSentinel: { pausedForOthers: false } },
          }),
        }),
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    describe('withdrawFromAlertsForPause', () => {
      it('takes the person out of every alert in progress', async () => {
        prisma.alertParticipant.findMany.mockResolvedValueOnce([
          { id: 'p-1', alertId: 'alert-1', isLead: false },
          { id: 'p-2', alertId: 'alert-2', isLead: false },
        ]);
        prisma.alert.findUnique.mockResolvedValue({
          userCompanionId: 'alice-id',
          participants: [],
        }); // notifyAlertParticipants, once per alert

        await service.withdrawFromAlertsForPause('sentinel-2');

        expect(prisma.alertParticipant.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['p-1', 'p-2'] } },
          data: {
            status: AlertParticipantStatus.CLOSED,
            closedAt: expect.any(Date),
          },
        });
        expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
          'alice-id',
          'alert-1',
        );
        expect(notifier.notifyAlertChanged).toHaveBeenCalledWith(
          'alice-id',
          'alert-2',
        );
      });

      it('refuses while the person is a Lead on an alert in progress', async () => {
        prisma.alertParticipant.findMany.mockResolvedValueOnce([
          { id: 'p-1', alertId: 'alert-1', isLead: true },
        ]);

        await expect(
          service.withdrawFromAlertsForPause('sentinel-1'),
        ).rejects.toThrow(ConflictException);
        expect(prisma.alertParticipant.updateMany).not.toHaveBeenCalled();
      });

      it('does nothing when the person is in no alert', async () => {
        await service.withdrawFromAlertsForPause('sentinel-2');
        expect(prisma.alertParticipant.updateMany).not.toHaveBeenCalled();
      });
    });
  });
});
