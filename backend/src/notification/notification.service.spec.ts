import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import { PUSH_SENDER } from './push-sender.interface';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let realtime: { notifyNotificationNew: jest.Mock };
  let push: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    realtime = { notifyNotificationNew: jest.fn() };
    push = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: REALTIME_NOTIFIER, useValue: realtime },
        { provide: PUSH_SENDER, useValue: push },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('create', () => {
    it('skips the write when the recipient is also the actor', async () => {
      const result = await service.create({
        userId: 'user-1',
        actorUserId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(realtime.notifyNotificationNew).not.toHaveBeenCalled();
      expect(push.send).not.toHaveBeenCalled();
    });

    it('persists the row and fires realtime + push for a different actor', async () => {
      prisma.notification.create.mockResolvedValueOnce({
        id: 'notif-1',
        type: NotificationType.ALERT_RAISED,
      });

      const result = await service.create({
        userId: 'user-1',
        actorUserId: 'user-2',
        type: NotificationType.ALERT_RAISED,
        targetId: 'alert-1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: NotificationType.ALERT_RAISED,
          actorUserId: 'user-2',
          actorLabel: undefined,
          accepted: undefined,
          targetId: 'alert-1',
        },
      });
      expect(realtime.notifyNotificationNew).toHaveBeenCalledWith('user-1');
      expect(push.send).toHaveBeenCalledWith('user-1', {
        id: 'notif-1',
        type: NotificationType.ALERT_RAISED,
      });
      expect(result).toEqual({
        id: 'notif-1',
        type: NotificationType.ALERT_RAISED,
      });
    });

    it('persists the row when there is no actor at all', async () => {
      prisma.notification.create.mockResolvedValueOnce({
        id: 'notif-2',
        type: NotificationType.NEW_MESSAGE,
      });

      await service.create({
        userId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it("only marks the caller's own unread notification", async () => {
      await service.markRead('user-1', 'notif-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('listMine / getUnreadCount', () => {
    it('scopes the list to the caller, newest first', async () => {
      await service.listMine('user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('scopes the unread count to the caller', async () => {
      await service.getUnreadCount('user-1');

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });
});
