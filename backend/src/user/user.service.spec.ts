import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserType, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    linkSentinels: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let otpSender: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      linkSentinels: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    otpSender = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
        { provide: OTP_SENDER, useValue: otpSender },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('updateProfile', () => {
    it('rejects when the caller already has a username set', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', userName: 'already-set' });

      await expect(
        service.updateProfile('my-id', { userName: 'new-name' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the username is already taken by someone else', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'my-id', userName: null }); // current user check
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'other-id', userName: 'ada123' }); // taken check

      await expect(
        service.updateProfile('my-id', { userName: 'ada123' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows setting the username when the account has none yet', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'my-id', userName: null }); // current user check
      prisma.user.findUnique.mockResolvedValueOnce(null); // taken check
      prisma.user.update.mockResolvedValue({ id: 'my-id', userName: 'ada123' });

      const result = await service.updateProfile('my-id', { userName: 'ada123' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'my-id' }, data: { userName: 'ada123' } }),
      );
      expect(result).toEqual({ id: 'my-id', userName: 'ada123' });
    });

    it('updates the profile on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: 'my-id', firstName: 'Ada' });

      const result = await service.updateProfile('my-id', { firstName: 'Ada' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'my-id' }, data: { firstName: 'Ada' } }),
      );
      expect(result).toEqual({ id: 'my-id', firstName: 'Ada' });
    });
  });

  describe('requestAddPhone', () => {
    it('rejects when the phone belongs to a real account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'other-id', userType: UserType.ACCOUNT });

      await expect(service.requestAddPhone('my-id', '+33600000000')).rejects.toThrow(ConflictException);
      expect(otpSender.send).not.toHaveBeenCalled();
    });

    it('sets the phone and sends an OTP when it is free', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      const result = await service.requestAddPhone('my-id', '+33600000000');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ phone: '+33600000000' }),
        }),
      );
      expect(otpSender.send).toHaveBeenCalledWith('+33600000000', expect.any(String));
      expect(result).toEqual({ message: 'Code sent' });
    });

    it('claims a passive ONLY_SMS stub and anonymizes it', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'stub-id',
        userType: UserType.ONLY_SMS,
      });
      prisma.user.update.mockResolvedValue({ id: 'my-id' });

      await service.requestAddPhone('my-id', '+33600000000');

      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: { userSentinelId: 'stub-id' },
        data: { userSentinelId: 'my-id' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'stub-id' },
        data: { phone: null, status: UserStatus.DELETED, deletedAt: expect.any(Date) },
      });
      // and the caller's own row still gets the phone + OTP
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ phone: '+33600000000' }),
        }),
      );
    });
  });

  describe('verifyAddPhone', () => {
    it('rejects when there is no pending code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'my-id', otpCodeHash: null });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects after too many attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 5,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() - 60_000),
        otpAttempts: 0,
      });

      await expect(service.verifyAddPhone('my-id', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong code and increments otpAttempts', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

      await expect(service.verifyAddPhone('my-id', '000000')).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('promotes UNCOMPLETE to ACCOUNT on success', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        userType: UserType.UNCOMPLETE,
      });
      prisma.user.update.mockResolvedValue({ id: 'my-id', userType: UserType.ACCOUNT });

      const result = await service.verifyAddPhone('my-id', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'my-id' },
          data: expect.objectContaining({ userType: UserType.ACCOUNT }),
        }),
      );
      expect(result).toEqual({ id: 'my-id', userType: UserType.ACCOUNT });
    });

    it('does not change userType when it was already something other than UNCOMPLETE', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'my-id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        userType: UserType.ACCOUNT,
      });
      prisma.user.update.mockResolvedValue({ id: 'my-id', userType: UserType.ACCOUNT });

      await service.verifyAddPhone('my-id', '123456');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userType: UserType.ACCOUNT }) }),
      );
    });
  });
});
