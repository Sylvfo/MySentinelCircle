import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';

// The 6-digit codes sent by SMS or email — login, adding a phone, step-up —
// all kept in the same User fields. One place for their rules, so they
// can't drift apart between the three flows.
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

// The User fields once no code is pending any more.
export const NO_ONE_TIME_CODE = {
  otpCodeHash: null,
  otpExpiresAt: null,
  otpAttempts: 0,
};

// A new code, and the User fields that store it (hashed, attempts reset).
export async function newOneTimeCode() {
  const code = String(randomInt(100000, 1000000));
  return {
    code,
    fields: {
      otpCodeHash: await bcrypt.hash(code, 10),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      otpAttempts: 0,
    },
  };
}

// Throws unless `code` is the user's pending one, still valid, within the
// attempts allowed. A wrong code uses up one attempt. The caller clears the
// code afterwards (NO_ONE_TIME_CODE), together with its own changes.
export async function checkOneTimeCode(
  prisma: PrismaService,
  user: {
    id: string;
    otpCodeHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
  },
  code: string,
  noPendingMessage: string,
) {
  if (!user.otpCodeHash || !user.otpExpiresAt) {
    throw new UnauthorizedException(noPendingMessage);
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new UnauthorizedException('Too many attempts, request a new code');
  }
  if (user.otpExpiresAt < new Date()) {
    throw new UnauthorizedException('Code expired, request a new one');
  }
  if (!(await bcrypt.compare(code, user.otpCodeHash))) {
    await prisma.user.update({
      where: { id: user.id },
      data: { otpAttempts: { increment: 1 } },
    });
    throw new UnauthorizedException('Invalid code');
  }
}
