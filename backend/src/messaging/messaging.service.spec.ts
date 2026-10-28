import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';

describe('MessagingService', () => {
  let service: MessagingService;
  let prisma: {
    conversationParticipant: { findFirst: jest.Mock; findMany: jest.Mock };
    conversation: { findFirst: jest.Mock; create: jest.Mock };
    message: { create: jest.Mock; findMany: jest.Mock };
  };
  let sentinel: { canSendDirectMessage: jest.Mock };
  let notifier: { notifyAlertChanged: jest.Mock; notifyNewMessage: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversationParticipant: { findFirst: jest.fn(), findMany: jest.fn() },
      conversation: { findFirst: jest.fn(), create: jest.fn() },
      message: { create: jest.fn(), findMany: jest.fn() },
    };
    sentinel = { canSendDirectMessage: jest.fn() };
    notifier = { notifyAlertChanged: jest.fn(), notifyNewMessage: jest.fn() };
    notifications = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SentinelService, useValue: sentinel },
        { provide: REALTIME_NOTIFIER, useValue: notifier },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
  });

  describe('getOrCreateDirectConversation', () => {
    it('returns the existing 1:1 conversation between the two, if one exists', async () => {
      sentinel.canSendDirectMessage.mockResolvedValueOnce(true);
      prisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        closedAt: null,
      });

      const result = await service.getOrCreateDirectConversation(
        'user-1',
        'user-2',
      );

      expect(sentinel.canSendDirectMessage).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          alertId: null,
          AND: [
            { participants: { some: { userId: 'user-1', leftAt: null } } },
            { participants: { some: { userId: 'user-2', leftAt: null } } },
          ],
        },
        select: { id: true, closedAt: true },
      });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'conv-1', closedAt: null });
    });

    it('lazily creates the conversation when none exists yet', async () => {
      sentinel.canSendDirectMessage.mockResolvedValueOnce(true);
      prisma.conversation.findFirst.mockResolvedValueOnce(null);
      prisma.conversation.create.mockResolvedValueOnce({
        id: 'conv-new',
        closedAt: null,
      });

      const result = await service.getOrCreateDirectConversation(
        'user-1',
        'user-2',
      );

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          participants: {
            create: [{ userId: 'user-1' }, { userId: 'user-2' }],
          },
        },
        select: { id: true, closedAt: true },
      });
      expect(result).toEqual({ id: 'conv-new', closedAt: null });
    });

    it('rejects when messaging isn’t currently allowed between the two', async () => {
      sentinel.canSendDirectMessage.mockResolvedValueOnce(false);

      await expect(
        service.getOrCreateDirectConversation('user-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('rejects messaging yourself', async () => {
      await expect(
        service.getOrCreateDirectConversation('user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(sentinel.canSendDirectMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('creates a message when the caller is an active participant of an open alert-scoped conversation', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: null, alertId: 'alert-1' },
      });
      prisma.message.create.mockResolvedValueOnce({ id: 'msg-1' });
      prisma.conversationParticipant.findMany.mockResolvedValueOnce([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);

      const result = await service.sendMessage('user-1', 'conv-1', {
        body: 'hello',
      });

      expect(result).toEqual({ id: 'msg-1' });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          body: 'hello',
          type: 'TEXT',
          senderId: 'user-1',
          conversationId: 'conv-1',
        },
      });
      // Alert-scoped (alertId set) — no direct-messaging permission re-check.
      expect(sentinel.canSendDirectMessage).not.toHaveBeenCalled();
      // Pushed to every active participant, sender included — harmless,
      // the sender's own UI already refetches after a successful send.
      expect(notifier.notifyNewMessage).toHaveBeenCalledWith(
        'user-1',
        'conv-1',
      );
      expect(notifier.notifyNewMessage).toHaveBeenCalledWith(
        'user-2',
        'conv-1',
      );
      // Persisted notification only to the other participant, never to the
      // sender's own inbox.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'user-2',
        type: NotificationType.NEW_MESSAGE,
        actorUserId: 'user-1',
        targetId: 'conv-1',
      });
    });

    it('re-checks the direct-messaging permission for a direct (alertId null) conversation', async () => {
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({
          id: 'part-1',
          conversation: { closedAt: null, alertId: null },
        })
        .mockResolvedValueOnce({ userId: 'user-2' }); // the other participant
      sentinel.canSendDirectMessage.mockResolvedValueOnce(true);
      prisma.message.create.mockResolvedValueOnce({ id: 'msg-1' });
      prisma.conversationParticipant.findMany.mockResolvedValueOnce([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);

      await service.sendMessage('user-1', 'conv-1', { body: 'hello' });

      expect(sentinel.canSendDirectMessage).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('rejects sending into a direct conversation once messaging has been turned off', async () => {
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({
          id: 'part-1',
          conversation: { closedAt: null, alertId: null },
        })
        .mockResolvedValueOnce({ userId: 'user-2' });
      sentinel.canSendDirectMessage.mockResolvedValueOnce(false);

      await expect(
        service.sendMessage('user-1', 'conv-1', { body: 'hello' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects a sender who is not an active participant', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.sendMessage('stranger', 'conv-1', { body: 'hello' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects sending into a closed conversation', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: new Date(), alertId: 'alert-1' },
      });

      await expect(
        service.sendMessage('user-1', 'conv-1', { body: 'hello' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('sendImageMessage', () => {
    it('creates an IMAGE message with the given filename as body, through the same checks as sendMessage', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: null, alertId: 'alert-1' },
      });
      prisma.message.create.mockResolvedValueOnce({
        id: 'msg-1',
        type: 'IMAGE',
      });
      prisma.conversationParticipant.findMany.mockResolvedValueOnce([
        { userId: 'user-1' },
      ]);

      const result = await service.sendImageMessage(
        'user-1',
        'conv-1',
        'abc123.jpg',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          body: 'abc123.jpg',
          type: 'IMAGE',
          senderId: 'user-1',
          conversationId: 'conv-1',
        },
      });
      expect(notifier.notifyNewMessage).toHaveBeenCalledWith(
        'user-1',
        'conv-1',
      );
      // Sender is the only participant here — no persisted notification
      // to themselves.
      expect(notifications.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'msg-1', type: 'IMAGE' });
    });

    it('rejects sending into a closed conversation, same as sendMessage', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: new Date(), alertId: 'alert-1' },
      });

      await expect(
        service.sendImageMessage('user-1', 'conv-1', 'abc123.jpg'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('returns messages, oldest first, for an active participant', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: null, alertId: 'alert-1' },
      });
      prisma.message.findMany.mockResolvedValueOnce([{ id: 'msg-1' }]);

      const result = await service.listMessages('user-1', 'conv-1');

      expect(result).toEqual([{ id: 'msg-1' }]);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('rejects a reader who is not an active participant', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce(null);

      await expect(service.listMessages('stranger', 'conv-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});
