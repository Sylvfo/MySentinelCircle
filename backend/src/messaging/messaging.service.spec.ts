import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MessagingService', () => {
  let service: MessagingService;
  let prisma: {
    conversationParticipant: { findFirst: jest.Mock };
    message: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      conversationParticipant: { findFirst: jest.fn() },
      message: { create: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
  });

  describe('sendMessage', () => {
    it('creates a message when the caller is an active participant of an open conversation', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: null },
      });
      prisma.message.create.mockResolvedValueOnce({ id: 'msg-1' });

      const result = await service.sendMessage('user-1', 'conv-1', {
        body: 'hello',
      });

      expect(result).toEqual({ id: 'msg-1' });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { body: 'hello', senderId: 'user-1', conversationId: 'conv-1' },
      });
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
        conversation: { closedAt: new Date() },
      });

      await expect(
        service.sendMessage('user-1', 'conv-1', { body: 'hello' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('returns messages, oldest first, for an active participant', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce({
        id: 'part-1',
        conversation: { closedAt: null },
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
