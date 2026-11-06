import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

// Shared freeze check: once a death notice is confirmed, the account is
// permanently DECEASED — existing data stays readable, but no new action
// (alert, Sentinel invitation/acceptance, message) is allowed. Plain
// function, no DI, same cross-module-import style as sms/messages.ts.
export function assertNotDeceased(
  user: { status: UserStatus } | null | undefined,
  label: string,
): void {
  if (user?.status === UserStatus.DECEASED) {
    throw new ForbiddenException(
      `${label} is deceased — no further action is possible`,
    );
  }
}

// "Pause for me": nobody else may raise an alert about this person. They
// can still raise one about themself.
export function assertNotPausedForMe(
  companion: { pausedForMe: boolean } | null | undefined,
  callerId: string,
  companionId: string,
): void {
  if (companion?.pausedForMe && callerId !== companionId) {
    throw new ForbiddenException(
      'This person has paused alerts about them — only they can raise one',
    );
  }
}

// "Pause for others": this person can't be asked to take part in any alert.
// Prisma filter for a LinkSentinels' Sentinel side, reused by every query
// that picks who to contact.
export const NOT_PAUSED_SENTINEL = { pausedForOthers: false } as const;
