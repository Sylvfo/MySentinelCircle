import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectService } from './connect.service';
import { SentinelService } from './sentinel.service';

describe('ConnectService', () => {
  let service: ConnectService;
  let prisma: {
    user: {
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let sentinel: { inviteSentinel: jest.Mock; requestToBeSentinel: jest.Mock };

  const lea = {
    id: 'lea',
    firstName: 'Léa',
    lastName: 'Martin',
    avatarPath: null,
    phone: '+41790000000',
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(lea),
      },
    };
    sentinel = { inviteSentinel: jest.fn(), requestToBeSentinel: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectService,
        { provide: PrismaService, useValue: prisma },
        { provide: SentinelService, useValue: sentinel },
      ],
    }).compile();
    service = module.get(ConnectService);
  });

  it('creates my code the first time, then keeps it', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({ connectCode: null });
    const { code } = await service.myCode('bob');
    expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'bob' },
      data: { connectCode: code },
    });

    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      connectCode: 'kept',
    });
    await expect(service.myCode('bob')).resolves.toEqual({ code: 'kept' });
  });

  it('a new code replaces the old one', async () => {
    const a = await service.renew('bob');
    const b = await service.renew('bob');
    expect(a.code).not.toBe(b.code);
  });

  it('says whose code it is: names and photo, never the number', async () => {
    const found = await service.resolve('bob', 'abc');
    expect(found).toEqual({
      id: 'lea',
      firstName: 'Léa',
      lastName: 'Martin',
      avatarPath: null,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { connectCode: 'abc', status: UserStatus.ACTIVE },
      }),
    );
  });

  it('refuses my own code and an unknown one', async () => {
    await expect(service.resolve('lea', 'abc')).rejects.toThrow(
      BadRequestException,
    );
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.resolve('bob', 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('"they watch over me": the usual invitation, by their number', async () => {
    await service.invite('bob', 'abc', 'circle-1');
    expect(sentinel.inviteSentinel).toHaveBeenCalledWith('bob', 'circle-1', {
      phone: '+41790000000',
      name: 'Léa',
    });
  });

  it('"I watch over them": the usual request, by their number', async () => {
    await service.request('bob', 'abc');
    expect(sentinel.requestToBeSentinel).toHaveBeenCalledWith('bob', {
      targetPhone: '+41790000000',
    });
  });

  it('needs them to have a phone number', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ ...lea, phone: null });
    await expect(service.request('bob', 'abc')).rejects.toThrow(
      'This person has no phone number yet',
    );
  });
});
