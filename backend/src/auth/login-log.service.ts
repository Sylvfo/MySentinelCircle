import { Injectable, Logger } from '@nestjs/common';
import { LoginMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Where a sign-in attempt came from, as the request tells it.
export interface LoginContext {
  ip?: string;
  userAgent?: string;
}

// How many past attempts the person sees in their Settings.
const SHOWN_LOGINS = 20;

// The journal of sign-in attempts on each account (LoginEvent): the person
// sees theirs in Settings, the admin page counts them. Kept 90 days
// (RetentionService), erased with the account.
@Injectable()
export class LoginLogService {
  private readonly logger = new Logger(LoginLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never blocks a sign-in: a journal that can't be written is only logged.
  async record(
    userId: string,
    method: LoginMethod,
    success: boolean,
    ctx: LoginContext = {},
  ) {
    try {
      await this.prisma.loginEvent.create({
        data: {
          userId,
          method,
          success,
          ipPrefix: ipPrefix(ctx.ip),
          userAgent: ctx.userAgent?.slice(0, 255) ?? null,
        },
      });
      if (success) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.warn(`Could not record a sign-in: ${String(err)}`);
    }
  }

  listMine(userId: string) {
    return this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: SHOWN_LOGINS,
      select: {
        createdAt: true,
        method: true,
        success: true,
        ipPrefix: true,
        userAgent: true,
      },
    });
  }
}

// The IP with its last part removed: enough to tell "my usual network" from
// "somewhere else", not enough to point at one device.
// 203.0.113.42 -> 203.0.113.x ; 2001:db8:85a3:8d3:… -> 2001:db8:85a3::/48
export function ipPrefix(ip?: string): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    return `${v4.split('.').slice(0, 3).join('.')}.x`;
  }
  if (ip === '::1') return 'local';
  const parts = ip.split(':');
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
  }
  return null;
}
