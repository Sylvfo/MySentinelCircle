import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PHONE_RECOVERY_DAYS,
  PhoneRecoveryService,
  pendingRecoveryPhone,
} from './phone-recovery.service';

const OLD = '+41791111111';
const NEW = '+41792222222';

const account = (over: Record<string, unknown> = {}) => ({
  id: 'me',
  firstName: 'Lea',
  phone: OLD,
  language: 'fr',
  userType: UserType.ACCOUNT,
  status: UserStatus.ACTIVE,
  pendingPhone: null as string | null,
  phoneRecoveryRequestedAt: null as Date | null,
  phoneRecoveryConfirmedById: null as string | null,
  otpCodeHash: null as string | null,
  otpExpiresAt: null as Date | null,
  otpAttempts: 0,
  ...over,
});

// A request waiting for its confirmations.
const pending = (over: Record<string, unknown> = {}) =>
  account({
    pendingPhone: NEW,
    phoneRecoveryRequestedAt: new Date(),
    ...over,
  });

const member = (id: string, lead: boolean, language: string | null = 'fr') => ({
  userSentinelId: id,
  leadSlot: lead ? 1 : null,
  linkAsSentinel: { phone: `+4179000000${id.length}`, language },
});

describe('PhoneRecoveryService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    linkSentinels: { findMany: jest.Mock };
  };
  let sms: { send: jest.Mock };
  let service: PhoneRecoveryService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      linkSentinels: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            member('lead', true, 'en'),
            member('other', false),
          ]),
      },
    };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    service = new PhoneRecoveryService(prisma as unknown as PrismaService, sms);
  });

  describe('pendingRecoveryPhone', () => {
    it('is the new number while the request is live', () => {
      expect(pendingRecoveryPhone(pending())).toBe(NEW);
    });

    it('is null once the request is too old', () => {
      const old = new Date(Date.now() - (PHONE_RECOVERY_DAYS + 1) * 86_400_000);
      expect(
        pendingRecoveryPhone(pending({ phoneRecoveryRequestedAt: old })),
      ).toBeNull();
    });

    it('is null for a phone added while signed in (no request date)', () => {
      expect(pendingRecoveryPhone(account({ pendingPhone: NEW }))).toBeNull();
    });
  });

  describe('request', () => {
    it('gives the same answer for an unknown number, and sends nothing', async () => {
      const answer = await service.request(OLD, NEW);

      expect(answer.message).toContain('If this number has an account');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it.each([
      ['an SMS-only Sentinel', { userType: UserType.ONLY_SMS }],
      ['a deceased person', { status: UserStatus.DECEASED }],
    ])('does nothing for %s', async (_label, over) => {
      prisma.user.findUnique.mockResolvedValueOnce(account(over));

      await service.request(OLD, NEW);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('stores the request and texts the 1st circle in their language, and the old number', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(account());

      await service.request(OLD, NEW);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'me' },
        data: expect.objectContaining({
          pendingPhone: NEW,
          phoneRecoveryRequestedAt: expect.any(Date),
          phoneRecoveryConfirmedById: null,
          otpCodeHash: null,
        }),
      });
      const texts = sms.send.mock.calls.map((c) => c[1] as string);
      expect(texts).toHaveLength(3);
      expect(texts[0]).toContain('Lea says they lost their phone');
      expect(texts[1]).toContain('Lea dit avoir perdu son telephone');
      expect(sms.send.mock.calls[2][0]).toBe(OLD);
    });

    it("doesn't ask the 1st circle twice for the same request", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(pending());

      await service.request(OLD, NEW);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('sends a fresh code when asked again after both confirmations', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        pending({ otpCodeHash: 'old-hash' }),
      );

      await service.request(OLD, NEW);

      expect(prisma.user.update.mock.calls[0][0].data.otpCodeHash).not.toBe(
        'old-hash',
      );
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send.mock.calls[0][0]).toBe(NEW);
    });
  });

  describe('confirm', () => {
    it('refuses someone outside the 1st circle', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(pending());

      await expect(service.confirm('stranger', 'me')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('fails when there is no live request', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(account());

      await expect(service.confirm('lead', 'me')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('records the first confirmation without sending a code', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(pending());

      await expect(service.confirm('other', 'me')).resolves.toEqual({
        confirmations: 1,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'me' },
        data: { phoneRecoveryConfirmedById: 'other' },
      });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('refuses the same person confirming twice', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        pending({ phoneRecoveryConfirmedById: 'lead' }),
      );

      await expect(service.confirm('lead', 'me')).rejects.toThrow(
        ConflictException,
      );
    });

    it('needs a Lead among the two', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        member('a', false),
        member('b', false),
        member('lead', true),
      ]);
      prisma.user.findUnique.mockResolvedValueOnce(
        pending({ phoneRecoveryConfirmedById: 'a' }),
      );

      await expect(service.confirm('b', 'me')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('sends the code to the new number on the second confirmation', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(pending({ phoneRecoveryConfirmedById: 'other' }))
        .mockResolvedValueOnce(null); // new number is free

      await expect(service.confirm('lead', 'me')).resolves.toEqual({
        confirmations: 2,
      });
      expect(prisma.user.update.mock.calls[0][0].data.otpCodeHash).toEqual(
        expect.any(String),
      );
      expect(sms.send.mock.calls[0][0]).toBe(NEW);
      expect(sms.send.mock.calls[0][1]).toContain(
        'votre 1er cercle a confirme',
      );
    });

    it('refuses when the new number already has an account', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(pending({ phoneRecoveryConfirmedById: 'other' }))
        .mockResolvedValueOnce({ id: 'someone-else' });

      await expect(service.confirm('lead', 'me')).rejects.toThrow(
        ConflictException,
      );
      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('ends the request and tells the new number', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(pending());

      await expect(service.reject('other', 'me')).resolves.toEqual({
        rejected: true,
      });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          pendingPhone: null,
          phoneRecoveryRequestedAt: null,
          otpCodeHash: null,
        }),
      );
      expect(sms.send.mock.calls[0][0]).toBe(NEW);
    });
  });

  describe('verify', () => {
    const approved = async (code: string) =>
      pending({
        phoneRecoveryConfirmedById: 'other',
        otpCodeHash: await bcrypt.hash(code, 4),
        otpExpiresAt: new Date(Date.now() + 60_000),
      });

    it('fails without a pending request', async () => {
      await expect(service.verify(NEW, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails before the 1st circle confirmed (no code yet)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(pending());

      await expect(service.verify(NEW, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong code', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(await approved('123456'));

      await expect(service.verify(NEW, '654321')).rejects.toThrow(
        'Invalid code',
      );
    });

    it('changes the number and signs out every device', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(await approved('123456'));

      await expect(service.verify(NEW, '123456')).resolves.toEqual({
        message: 'Phone number changed',
      });
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          phone: NEW,
          phoneVerifiedAt: expect.any(Date),
          pendingPhone: null,
          phoneRecoveryRequestedAt: null,
          phoneRecoveryConfirmedById: null,
          otpCodeHash: null,
          sessionsValidAfter: expect.any(Date),
        }),
      );
    });
  });
});
