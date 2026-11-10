import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { User, UserType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

// Small lookups and checks shared by SentinelService, GroupService and
// DeathNoticeService.

// Finds or creates a Sentinel-by-phone. Every party is a User row now (no
// separate Contact model) — a phone-only Sentinel is a User with
// userType ONLY_SMS. Phone is globally unique, so this is a single lookup,
// not scoped per companion like the old Contact list was.
// `language`: the inviter's, for the SMS sent to someone without an account
// (kept if they already have one).
export async function findOrCreateUserByPhone(
  prisma: PrismaService,
  phone: string,
  name: string,
  language?: string | null,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  // A number that only ever started a phone login has no name yet.
  if (existing?.firstName === '') {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: name,
        ...(existing.language ? {} : { language: language ?? null }),
      },
    });
  }
  if (existing) return existing;
  return prisma.user.create({
    data: {
      phone,
      firstName: name,
      userType: UserType.ONLY_SMS,
      language: language ?? null,
    },
  });
}

export function assertCompleteAccount(user: Pick<User, 'userType'>) {
  if (user.userType === UserType.UNCOMPLETE) {
    throw new ForbiddenException(
      'Add a phone number to your account before using Sentinels',
    );
  }
  if (user.userType === UserType.ONLY_SMS) {
    throw new ForbiddenException('Complete your profile first');
  }
}

export async function getUserOrThrow(
  prisma: PrismaService,
  userId: string,
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException('User not found');
  return user;
}

// How a person is named in texts sent to others.
export function userLabel(user: Pick<User, 'firstName' | 'phone'>): string {
  return user.firstName ?? user.phone ?? 'Sentinel';
}
