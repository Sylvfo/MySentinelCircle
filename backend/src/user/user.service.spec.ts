import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserType, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    linkSentinels: {
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    circle: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let otpSender: { send: jest.Mock };
  let emailSender: { send: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      linkSentinels: {
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      circle: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    otpSender = { send: jest.fn() };
    emailSender = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: OTP_SENDER, useValue: otpSender },
        { provide: EMAIL_SENDER, useValue: emailSender },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('updateProfile', () => {
    it('rejects when the caller already has a username set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        userName: 'already-set',
      });

      await expect(
        service.updateProfile('my-id', { userName: 'new-name' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the username is already taken by someone else', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        userName: null,
      }); // current user check
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'other-id',
        userName: 'ada123',
      }); // taken check

      await expect(
        service.updateProfile('my-id', { userName: 'ada123' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows setting the username when the account has none yet', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        userName: null,
      }); // current user check
      prisma.user.findUnique.mockResolvedValueOnce(null); // taken check
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        userName: 'ada123',
        passwordHash: null,
        googleId: null,
      });

      const result = await service.updateProfile('my-id', {
        userName: 'ada123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: { userName: 'ada123' },
        }),
      );
      expect(result).toEqual({
        id: 'my-id',
        userName: 'ada123',
        hasPassword: false,
        hasGoogle: false,
      });
    });

    it('updates the profile on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        firstName: 'Ada',
        passwordHash: null,
        googleId: null,
      });

      const result = await service.updateProfile('my-id', { firstName: 'Ada' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: { firstName: 'Ada' },
        }),
      );
      expect(result).toEqual({
        id: 'my-id',
        firstName: 'Ada',
        hasPassword: false,
        hasGoogle: false,
      });
    });
  });

  describe('completeProfile', () => {
    it('stores a hashed password and promotes to ACCOUNT', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        userType: UserType.ONLY_SMS,
        phoneVerifiedAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        passwordHash: 'hash',
        googleId: null,
      });

      await service.completeProfile('my-id', {
        firstName: 'Ada',
        password: 'password123',
      });

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.userType).toBe(UserType.ACCOUNT);
      expect(data).not.toHaveProperty('password');
      await expect(
        bcrypt.compare('password123', data.passwordHash),
      ).resolves.toBe(true);
    });
  });

  describe('completeProfile — default circles', () => {
    const labels = (data: { myCircles: { create: { label: string }[] } }) =>
      data.myCircles.create.map((c) => c.label);

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        userType: UserType.ONLY_SMS,
        phoneVerifiedAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        passwordHash: 'hash',
        googleId: null,
      });
    });

    it('creates the 1st circle and the three default ones', async () => {
      await service.completeProfile('my-id', {
        firstName: 'Ada',
        password: 'password123',
      });

      expect(labels(prisma.user.update.mock.calls[0][0].data)).toEqual([
        'Premier cercle',
        'Voisins',
        'Sport',
        'Travail',
      ]);
    });

    it('never creates a second 1st circle', async () => {
      prisma.circle.count.mockResolvedValue(1);

      await service.completeProfile('my-id', {
        firstName: 'Ada',
        password: 'password123',
      });

      expect(labels(prisma.user.update.mock.calls[0][0].data)).toEqual([
        'Voisins',
        'Sport',
        'Travail',
      ]);
    });
  });

  describe('setPassword', () => {
    it('rejects without a fresh step-up', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        stepUpVerifiedAt: null,
      });

      await expect(service.setPassword('my-id', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets the password and lifts a lock', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        stepUpVerifiedAt: new Date(),
      });

      await service.setPassword('my-id', 'password123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: {
          passwordHash: expect.any(String),
          loginAttempts: 0,
          loginLockedUntil: null,
        },
      });
    });
  });

  describe('changePassword', () => {
    it('rejects when the account has no password to change', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        passwordHash: null,
      });

      await expect(
        service.changePassword('my-id', {
          currentPassword: 'whatever',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the current password is wrong', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', passwordHash });

      await expect(
        service.changePassword('my-id', {
          currentPassword: 'wrong-password',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the password on success', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', passwordHash });

      const result = await service.changePassword('my-id', {
        currentPassword: 'correct-password',
        newPassword: 'newpassword1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { passwordHash: expect.any(String) },
      });
      expect(result).toEqual({ message: 'Password updated' });
    });
  });

  describe('requestAddPhone', () => {
    it('rejects when the phone belongs to a real account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other-id',
        userType: UserType.ACCOUNT,
      });

      await expect(
        service.requestAddPhone('my-id', '+33600000000'),
      ).rejects.toThrow(ConflictException);
      expect(otpSender.send).not.toHaveBeenCalled();
    });

    it('keeps the number pending and sends an OTP when it is free', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      const result = await service.requestAddPhone('my-id', '+33600000000');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ pendingPhone: '+33600000000' }),
        }),
      );
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
        'phone',
      );
      expect(otpSender.send).toHaveBeenCalledWith(
        '+33600000000',
        expect.any(String),
      );
      expect(result).toEqual({ message: 'Code sent' });
    });

    it('leaves a passive ONLY_SMS stub untouched until the code is verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'stub-id',
        userType: UserType.ONLY_SMS,
      });
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      await service.requestAddPhone('my-id', '+33600000000');

      expect(prisma.linkSentinels.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ pendingPhone: '+33600000000' }),
        }),
      );
    });
  });

  describe('verifyAddPhone', () => {
    it('rejects when there is no pending code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash: null,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a code when no number is pending', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingPhone: null,
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects after too many attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingPhone: '+33600000000',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 5,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingPhone: '+33600000000',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() - 60_000),
        otpAttempts: 0,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong code and increments otpAttempts', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingPhone: '+33600000000',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

      await expect(service.verifyAddPhone('my-id', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('claims a passive ONLY_SMS stub once the code is valid', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'my-id',
          pendingPhone: '+33600000000',
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + 60_000),
          otpAttempts: 0,
          userType: UserType.UNCOMPLETE,
        })
        .mockResolvedValueOnce({
          id: 'stub-id',
          userType: UserType.ONLY_SMS,
        });
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        passwordHash: null,
        googleId: null,
      });

      await service.verifyAddPhone('my-id', '123456');

      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: { userSentinelId: 'stub-id' },
        data: { userSentinelId: 'my-id' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'stub-id' },
        data: {
          phone: null,
          status: UserStatus.DELETED,
          deletedAt: expect.any(Date),
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({
            phone: '+33600000000',
            pendingPhone: null,
          }),
        }),
      );
    });

    it('rejects a number taken by a real account in the meantime', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'my-id',
          pendingPhone: '+33600000000',
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + 60_000),
          otpAttempts: 0,
        })
        .mockResolvedValueOnce({
          id: 'other-id',
          userType: UserType.ACCOUNT,
        });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('promotes UNCOMPLETE to ACCOUNT on success', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        pendingPhone: '+33600000000',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        userType: UserType.UNCOMPLETE,
      });
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        userType: UserType.ACCOUNT,
        passwordHash: null,
        googleId: null,
      });

      const result = await service.verifyAddPhone('my-id', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ userType: UserType.ACCOUNT }),
        }),
      );
      expect(result).toEqual({
        id: 'my-id',
        userType: UserType.ACCOUNT,
        hasPassword: false,
        hasGoogle: false,
      });
    });

    it('does not change userType when it was already something other than UNCOMPLETE', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        pendingPhone: '+33600000000',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        userType: UserType.ACCOUNT,
      });
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue({
        id: 'my-id',
        userType: UserType.ACCOUNT,
      });

      await service.verifyAddPhone('my-id', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userType: UserType.ACCOUNT }),
        }),
      );
    });
  });

  describe('requestAddPhone — step-up required when changing an existing phone', () => {
    it('rejects when the caller already has a phone and step-up is not fresh', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        phone: '+33600000001',
        stepUpVerifiedAt: null,
      });

      await expect(
        service.requestAddPhone('my-id', '+33600000002'),
      ).rejects.toThrow(UnauthorizedException);
      expect(otpSender.send).not.toHaveBeenCalled();
    });

    it('allows changing the phone once step-up is fresh', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        phone: '+33600000001',
        stepUpVerifiedAt: new Date(),
      }); // caller check
      prisma.user.findUnique.mockResolvedValueOnce(null); // target phone free
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      await service.requestAddPhone('my-id', '+33600000002');

      expect(otpSender.send).toHaveBeenCalledWith(
        '+33600000002',
        expect.any(String),
      );
    });
  });

  describe('stepUpPassword', () => {
    it('rejects when the account has no password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        passwordHash: null,
      });

      await expect(service.stepUpPassword('my-id', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects on a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', passwordHash });

      await expect(
        service.stepUpPassword('my-id', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('marks the account step-up verified on success', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', passwordHash });
      prisma.user.update.mockResolvedValue({});

      const result = await service.stepUpPassword('my-id', 'correct-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { stepUpVerifiedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Identity verified' });
    });
  });

  describe('stepUpGoogle', () => {
    it('rejects when the account has no linked Google identity', async () => {
      jest
        .spyOn(service as any, 'verifyGoogleIdToken')
        .mockResolvedValue({ googleId: 'google-123' });
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', googleId: null });

      await expect(service.stepUpGoogle('my-id', 'fake-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the token is for a different Google identity', async () => {
      jest
        .spyOn(service as any, 'verifyGoogleIdToken')
        .mockResolvedValue({ googleId: 'google-123' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        googleId: 'google-456',
      });

      await expect(service.stepUpGoogle('my-id', 'fake-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('marks the account step-up verified on success', async () => {
      jest
        .spyOn(service as any, 'verifyGoogleIdToken')
        .mockResolvedValue({ googleId: 'google-123' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        googleId: 'google-123',
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.stepUpGoogle('my-id', 'fake-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { stepUpVerifiedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Identity verified' });
    });
  });

  describe('stepUpCodeRequest', () => {
    it('clears a pending phone so its code cannot validate that number', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        email: 'me@example.com',
        pendingPhone: '+33600000000',
      });
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      await service.stepUpCodeRequest('my-id', { channel: 'email' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pendingPhone: null }),
        }),
      );
    });

    it('rejects the phone channel when there is no verified phone', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        phone: null,
        phoneVerifiedAt: null,
      });

      await expect(
        service.stepUpCodeRequest('my-id', { channel: 'phone' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(otpSender.send).not.toHaveBeenCalled();
    });

    it('rejects the email channel when there is no email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', email: null });

      await expect(
        service.stepUpCodeRequest('my-id', { channel: 'email' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('sends a code to the current phone', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        phone: '+33600000000',
        phoneVerifiedAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({});

      await service.stepUpCodeRequest('my-id', { channel: 'phone' });

      expect(otpSender.send).toHaveBeenCalledWith(
        '+33600000000',
        expect.any(String),
      );
    });

    it('sends a code to the current email', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        email: 'ada@example.com',
      });
      prisma.user.update.mockResolvedValue({});

      await service.stepUpCodeRequest('my-id', { channel: 'email' });

      expect(emailSender.send).toHaveBeenCalledWith(
        'ada@example.com',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('stepUpCodeVerify', () => {
    it('rejects when there is no pending code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash: null,
      });

      await expect(service.stepUpCodeVerify('my-id', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong code and increments otpAttempts', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

      await expect(service.stepUpCodeVerify('my-id', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('marks the account step-up verified on success', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.stepUpCodeVerify('my-id', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { stepUpVerifiedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Identity verified' });
    });
  });

  describe('requestEmailChange', () => {
    it('rejects when step-up is not fresh', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        stepUpVerifiedAt: null,
      });

      await expect(
        service.requestEmailChange('my-id', 'new@example.com'),
      ).rejects.toThrow(UnauthorizedException);
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('rejects when the new email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        stepUpVerifiedAt: new Date(),
      }); // caller
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'other-id',
        email: 'new@example.com',
      }); // taken check

      await expect(
        service.requestEmailChange('my-id', 'new@example.com'),
      ).rejects.toThrow(ConflictException);
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('stores the pending email and sends a confirmation link on success', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'my-id',
        stepUpVerifiedAt: new Date(),
      }); // caller
      prisma.user.findUnique.mockResolvedValueOnce(null); // taken check
      prisma.user.update.mockResolvedValue({});

      const result = await service.requestEmailChange(
        'my-id',
        'new@example.com',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: expect.objectContaining({ pendingEmail: 'new@example.com' }),
      });
      expect(emailSender.send).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual({
        message: 'Confirmation link sent to the new email',
      });
    });
  });

  describe('confirmEmailChange', () => {
    it('rejects an unknown or expired token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.confirmEmailChange('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired pending email request', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingEmail: 'new@example.com',
        pendingEmailExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.confirmEmailChange('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('applies the pending email on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        pendingEmail: 'new@example.com',
        pendingEmailExpiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.confirmEmailChange('some-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: {
          email: 'new@example.com',
          pendingEmail: null,
          pendingEmailTokenHash: null,
          pendingEmailExpiresAt: null,
        },
      });
      expect(result).toEqual({ message: 'Email updated' });
    });
  });

  describe('devSetHasPaid', () => {
    it('is refused unless ALLOW_DEV_ROUTES is "true"', async () => {
      await expect(
        service.devSetHasPaid('my-id', { hasPaid: true }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates hasPaid and returns the profile dto', async () => {
      config.get.mockReturnValue('true');
      prisma.user.update.mockResolvedValueOnce({
        id: 'my-id',
        passwordHash: null,
        googleId: null,
        hasPaid: true,
      });

      const result = await service.devSetHasPaid('my-id', { hasPaid: true });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: { hasPaid: true },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'my-id', hasPaid: true }),
      );
    });
  });

  describe('getMyDeathNotice', () => {
    it('returns the announcement and the accepted Sentinels with their opt-in state', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        deathAnnouncementMessage: 'Au revoir a tous.',
      });
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          id: 'link-1',
          notifyOnDeath: true,
          deathPersonalMessage: 'Tu vas me manquer',
          linkAsSentinel: { firstName: 'Bob', phone: '+41791111111' },
        },
      ]);

      const result = await service.getMyDeathNotice('my-id');

      expect(result).toEqual({
        announcementMessage: 'Au revoir a tous.',
        recipients: [
          {
            linkId: 'link-1',
            sentinelLabel: 'Bob',
            notifyOnDeath: true,
            personalMessage: 'Tu vas me manquer',
          },
        ],
      });
    });
  });

  describe('updateMyDeathNotice', () => {
    it('updates the announcement message', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      const result = await service.updateMyDeathNotice('my-id', {
        announcementMessage: 'Nouveau message',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { deathAnnouncementMessage: 'Nouveau message' },
      });
      expect(result).toEqual({ announcementMessage: 'Nouveau message' });
    });
  });

  describe('setDeathNoticeRecipients', () => {
    it('rejects a linkId that is not one of the caller’s own Sentinels', async () => {
      prisma.linkSentinels.count.mockResolvedValueOnce(0); // not owned

      await expect(
        service.setDeathNoticeRecipients('my-id', {
          recipients: [{ linkId: 'not-mine' }],
        }),
      ).rejects.toThrow('One of these Sentinels is not yours');
      expect(prisma.linkSentinels.updateMany).not.toHaveBeenCalled();
    });

    it('replaces the full recipient set: clears everyone else, sets the submitted ones', async () => {
      prisma.linkSentinels.count.mockResolvedValueOnce(1); // owns link-1
      prisma.linkSentinels.updateMany.mockResolvedValueOnce({ count: 2 });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });
      prisma.user.findUnique.mockResolvedValueOnce({
        deathAnnouncementMessage: '',
      }); // getMyDeathNotice's re-read
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]);

      await service.setDeathNoticeRecipients('my-id', {
        recipients: [{ linkId: 'link-1', personalMessage: 'Merci pour tout' }],
      });

      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: { userCompanionId: 'my-id', id: { notIn: ['link-1'] } },
        data: { notifyOnDeath: false, deathPersonalMessage: null },
      });
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { notifyOnDeath: true, deathPersonalMessage: 'Merci pour tout' },
      });
    });
  });
});
