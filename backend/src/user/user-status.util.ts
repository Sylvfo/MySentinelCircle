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
