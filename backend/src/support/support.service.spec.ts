import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupportService } from './support.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SupportService', () => {
  let service: SupportService;
  let prisma: {
    user: { findUnique: jest.Mock };
    conversation: { findFirst: jest.Mock };
  };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      conversation: { findFirst: jest.fn() },
    };
    config = { get: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(SupportService);
  });

  it('has no support account when SUPPORT_EMAIL is not set', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.getSupportUserId()).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('finds the support account by its email', async () => {
    config.get.mockReturnValue(' support@testmsc.ch ');
    prisma.user.findUnique.mockResolvedValue({ id: 'support' });

    await expect(service.getSupportUserId()).resolves.toBe('support');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'support@testmsc.ch' },
      select: { id: true },
    });
  });

  it('finds my feedback thread', async () => {
    config.get.mockReturnValue('support@testmsc.ch');
    prisma.user.findUnique.mockResolvedValue({ id: 'support' });
    prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-support' });

    await expect(service.findSupportConversationId('user-1')).resolves.toBe(
      'conv-support',
    );
  });

  it('gives the support account no own thread', async () => {
    config.get.mockReturnValue('support@testmsc.ch');
    prisma.user.findUnique.mockResolvedValue({ id: 'support' });

    await expect(
      service.findSupportConversationId('support'),
    ).resolves.toBeNull();
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
  });
});
