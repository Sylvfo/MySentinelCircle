import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
  let jwt: { sign: jest.Mock };
  let otpSender: { send: jest.Mock };
  let emailSender: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
    otpSender = { send: jest.fn() };
    emailSender = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: OTP_SENDER, useValue: otpSender },
        { provide: EMAIL_SENDER, useValue: emailSender },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('claimOrCreateByPhone (via signupPhone)', () => {
    it('creates a new user when no row exists for the phone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-id',
        phone: '+33600000000',
      });

      const result = await service.signupPhone({
        firstName: 'Ada',
        phone: '+33600000000',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          phone: '+33600000000',
          userType: UserType.ACCOUNT,
          firstName: 'Ada',
        },
      });
      expect(result).toEqual({ userId: 'new-id' });
    });

    it('claims and upgrades an existing ONLY_SMS sentinel-stub row, keeping its id', async () => {
      const stub = {
        id: 'stub-id',
        phone: '+33600000000',
        userType: UserType.ONLY_SMS,
      };
      prisma.user.findUnique.mockResolvedValue(stub);
      prisma.user.update.mockResolvedValue({
        ...stub,
        userType: UserType.ACCOUNT,
        firstName: 'Ada',
      });

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
        if (where.email)
          return Promise.resolve({ id: 'other-id', email: 'ada@example.com' });
        return Promise.resolve(null);
      });

      await expect(
        service.signupGoogle({
          firstName: 'Ada',
          userName: 'ada123',
          idToken: 'fake-token',
          phone: '+33600000000',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the username is already taken', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.userName)
          return Promise.resolve({ id: 'other-id', userName: 'ada123' });
        return Promise.resolve(null);
      });

      await expect(
        service.signupGoogle({
          firstName: 'Ada',
          userName: 'ada123',
          idToken: 'fake-token',
          phone: '+33600000000',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates an UNCOMPLETE account and returns an access token on success, without a phone', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-id' });

      const result = await service.signupGoogle({
        firstName: 'Ada',
        userName: 'ada123',
        idToken: 'fake-token',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleId: 'google-123',
            userType: UserType.UNCOMPLETE,
          }),
        }),
      );
      expect(otpSender.send).not.toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });
  });

  describe('signupEmail', () => {
    it('rejects when the email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        email: 'ada@example.com',
      });

      await expect(
        service.signupEmail({
          firstName: 'Ada',
          userName: 'ada123',
          email: 'ada@example.com',
          password: 'password123',
          phone: '+33600000000',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the username is already taken', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // email check
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        userName: 'ada123',
      }); // username check

      await expect(
        service.signupEmail({
          firstName: 'Ada',
          userName: 'ada123',
          email: 'ada@example.com',
          password: 'password123',
          phone: '+33600000000',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the account and sends an OTP on success, with a phone', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // email check
      prisma.user.findUnique.mockResolvedValueOnce(null); // username check
      prisma.user.findUnique.mockResolvedValueOnce(null); // claimOrCreateByPhone check
      prisma.user.create.mockResolvedValue({
        id: 'new-id',
        phone: '+33600000000',
      });

      const result = await service.signupEmail({
        firstName: 'Ada',
        userName: 'ada123',
        email: 'ada@example.com',
        password: 'password123',
        phone: '+33600000000',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ada@example.com',
            userType: UserType.ACCOUNT,
          }),
        }),
      );
      expect(otpSender.send).toHaveBeenCalledWith(
        '+33600000000',
        expect.any(String),
      );
      expect(result).toEqual({ userId: 'new-id' });
    });

    it('creates an UNCOMPLETE account and returns an access token on success, without a phone', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // email check
      prisma.user.findUnique.mockResolvedValueOnce(null); // username check
      prisma.user.create.mockResolvedValue({ id: 'new-id' });

      const result = await service.signupEmail({
        firstName: 'Ada',
        userName: 'ada123',
        email: 'ada@example.com',
        password: 'password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ada@example.com',
            userType: UserType.UNCOMPLETE,
          }),
        }),
      );
      expect(otpSender.send).not.toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });
  });

  describe('loginEmail', () => {
    it('rejects when no account exists for the email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginEmail({
          email: 'ada@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the account has no passwordHash (Google/phone-only)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash: null,
      });

      await expect(
        service.loginEmail({
          email: 'ada@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects on a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash,
      });

      await expect(
        service.loginEmail({
          email: 'ada@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the phone is not verified', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash,
        phone: '+33600000000',
        phoneVerifiedAt: null,
      });

      await expect(
        service.loginEmail({
          email: 'ada@example.com',
          password: 'correct-password',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('logs in an account with no phone at all, even though phoneVerifiedAt is null', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash,
        phone: null,
        phoneVerifiedAt: null,
      });

      const result = await service.loginEmail({
        email: 'ada@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });

    it('returns an access token on success', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash,
        phoneVerifiedAt: new Date(),
      });

      const result = await service.loginEmail({
        email: 'ada@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });
  });

  describe('loginGoogle', () => {
    it('rejects an invalid Google token', async () => {
      jest
        .spyOn(service as any, 'verifyGoogleIdToken')
        .mockRejectedValue(new UnauthorizedException('Invalid Google token'));

      await expect(
        service.loginGoogle({ idToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when no account is linked to this Google identity', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginGoogle({ idToken: 'fake-token' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the phone is not verified', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        googleId: 'google-123',
        phone: '+33600000000',
        phoneVerifiedAt: null,
      });

      await expect(
        service.loginGoogle({ idToken: 'fake-token' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('logs in an account with no phone at all, even though phoneVerifiedAt is null', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        googleId: 'google-123',
        phone: null,
        phoneVerifiedAt: null,
      });

      const result = await service.loginGoogle({ idToken: 'fake-token' });

      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });

    it('returns an access token on success', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        googleId: 'google-123',
        phoneVerifiedAt: new Date(),
      });

      const result = await service.loginGoogle({ idToken: 'fake-token' });

      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });
  });

  describe('linkGoogle', () => {
    it('rejects when the Google identity is already linked to another user', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'other-id',
        googleId: 'google-123',
      });

      await expect(service.linkGoogle('my-id', 'fake-token')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('links the Google identity to the caller on success', async () => {
      jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
        googleId: 'google-123',
        email: 'ada@example.com',
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.linkGoogle('my-id', 'fake-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'my-id' },
        data: { googleId: 'google-123' },
      });
      expect(result).toEqual({ message: 'Google account linked' });
    });
  });

  describe('verifyOtp', () => {
    it('rejects when there is no pending OTP for the account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ userId: 'id', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects after too many attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 5,
      });

      await expect(
        service.verifyOtp({ userId: 'id', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        otpCodeHash: 'hash',
        otpExpiresAt: new Date(Date.now() - 60_000),
        otpAttempts: 0,
      });

      await expect(
        service.verifyOtp({ userId: 'id', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong code and increments otpAttempts', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

      await expect(
        service.verifyOtp({ userId: 'id', code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'id' },
        data: { otpAttempts: { increment: 1 } },
      });
    });

    it('verifies the phone on first success (phoneVerifiedAt was null)', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        phoneVerifiedAt: null,
      });

      const result = await service.verifyOtp({ userId: 'id', code: '123456' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'id' },
        data: {
          otpCodeHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          phoneVerifiedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });

    it('does not overwrite phoneVerifiedAt when already verified', async () => {
      const otpCodeHash = await bcrypt.hash('123456', 10);
      const alreadyVerifiedAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
        phoneVerifiedAt: alreadyVerifiedAt,
      });

      await service.verifyOtp({ userId: 'id', code: '123456' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'id' },
        data: {
          otpCodeHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          phoneVerifiedAt: alreadyVerifiedAt,
        },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('sends a reset email when the account has a passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash: 'hash',
      });

      const result = await service.requestPasswordReset({
        email: 'ada@example.com',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'id' },
        data: {
          passwordResetTokenHash: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        },
      });
      expect(emailSender.send).toHaveBeenCalledWith(
        'ada@example.com',
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual({
        message:
          'If an account exists for this email, a reset link has been sent.',
      });
    });

    it('does nothing but still returns the generic message when no account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.requestPasswordReset({
        email: 'unknown@example.com',
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'If an account exists for this email, a reset link has been sent.',
      });
    });

    it('does nothing for an account without a passwordHash (Google/phone-only)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        email: 'ada@example.com',
        passwordHash: null,
      });

      const result = await service.requestPasswordReset({
        email: 'ada@example.com',
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'If an account exists for this email, a reset link has been sent.',
      });
    });
  });

  describe('confirmPasswordReset', () => {
    it('rejects when no account matches the token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPasswordReset({
          token: 'bad-token',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        passwordResetExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.confirmPasswordReset({
          token: 'expired-token',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates the password and clears the reset token on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'id',
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.confirmPasswordReset({
        token: 'valid-token',
        newPassword: 'newpassword1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'id' },
        data: {
          passwordHash: expect.any(String),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      });
      expect(result).toEqual({ message: 'Password updated' });
    });
  });
});
