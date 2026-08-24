import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from './otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: OTP_SENDER, useValue: { send: jest.fn() } },
        { provide: EMAIL_SENDER, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('claimOrCreateByPhone (via signupPhone)', () => {
    it('creates a new user when no row exists for the phone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-id', phone: '+33600000000' });

      const result = await service.signupPhone({
        firstName: 'Ada',
        phone: '+33600000000',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { phone: '+33600000000', userType: UserType.ACCOUNT, firstName: 'Ada' },
      });
      expect(result).toEqual({ userId: 'new-id' });
    });

    it('claims and upgrades an existing ONLY_SMS sentinel-stub row, keeping its id', async () => {
      const stub = { id: 'stub-id', phone: '+33600000000', userType: UserType.ONLY_SMS };
      prisma.user.findUnique.mockResolvedValue(stub);
      prisma.user.update.mockResolvedValue({ ...stub, userType: UserType.ACCOUNT, firstName: 'Ada' });

      const result = await service.signupPhone({
        firstName: 'Ada',
        phone: '+33600000000',
      });

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'stub-id' },
        data: { userType: UserType.ACCOUNT, firstName: 'Ada' },
      });
      expect(result).toEqual({ userId: 'stub-id' });
    });

    it('rejects a phone already claimed by a real account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        phone: '+33600000000',
        userType: UserType.ACCOUNT,
      });

      await expect(
        service.signupPhone({ firstName: 'Ada', phone: '+33600000000' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('signupGoogle', () => {
    it('rejects when the Google email is already used by another account', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.googleId) return Promise.resolve(null);
        if (where.email) return Promise.resolve({ id: 'other-id', email: 'ada@example.com' });
        return Promise.resolve(null);
      });

      await expect(
        service.signupGoogle({
          firstName: 'Ada',
          idToken: 'fake-token',
          phone: '+33600000000',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
