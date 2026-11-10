import { Injectable } from '@nestjs/common';
import { CircleStatus, CircleType, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOT_A_WATCH, RUNNING_ALERT } from '../common/running-alert';

const DAY_MS = 86_400_000;
const WEEKS_SHOWN = 8;
// A network with this many failed sign-ins in 24 h is worth a look.
const SUSPICIOUS_FAILURES = 5;
// An account with this many failed sign-ins in 24 h is probably targeted.
const TARGETED_FAILURES = 3;

// Counts only: no names, no numbers, nothing that points at one person.
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(now = new Date()) {
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const realAccount = {
      status: UserStatus.ACTIVE,
      userType: { in: [UserType.ACCOUNT, UserType.UNCOMPLETE] },
    };

    const [
      accounts,
      incomplete,
      smsOnly,
      deleted,
      new7d,
      new30d,
      recentAccounts,
      activeToday,
      active7d,
      active30d,
      alertsTotal,
      alertsRunning,
      alerts30d,
      messages30d,
      groups,
      logins24h,
      failures24h,
      lockedAccounts,
      failuresByNetwork,
      failuresByAccount,
    ] = await Promise.all([
      this.prisma.user.count({ where: realAccount }),
      this.prisma.user.count({
        where: { status: UserStatus.ACTIVE, userType: UserType.UNCOMPLETE },
      }),
      this.prisma.user.count({
        where: { status: UserStatus.ACTIVE, userType: UserType.ONLY_SMS },
      }),
      this.prisma.user.count({ where: { status: UserStatus.DELETED } }),
      this.prisma.user.count({
        where: { ...realAccount, createdAt: { gte: ago(7) } },
      }),
      this.prisma.user.count({
        where: { ...realAccount, createdAt: { gte: ago(30) } },
      }),
      this.prisma.user.findMany({
        where: { ...realAccount, createdAt: { gte: ago(WEEKS_SHOWN * 7) } },
        select: { createdAt: true },
      }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago(1) } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago(7) } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago(30) } } }),
      this.prisma.alert.count({ where: { alertStatus: NOT_A_WATCH } }),
      this.prisma.alert.count({
        where: { alertStatus: RUNNING_ALERT },
      }),
      this.prisma.alert.count({ where: { launchedAt: { gte: ago(30) } } }),
      this.prisma.message.count({ where: { createdAt: { gte: ago(30) } } }),
      this.prisma.circle.count({
        where: {
          circleType: CircleType.GROUP,
          groupRootId: null,
          status: CircleStatus.ACTIVE,
        },
      }),
      this.prisma.loginEvent.count({
        where: { success: true, createdAt: { gte: ago(1) } },
      }),
      this.prisma.loginEvent.count({
        where: { success: false, createdAt: { gte: ago(1) } },
      }),
      this.prisma.user.count({ where: { loginLockedUntil: { gt: now } } }),
      this.prisma.loginEvent.groupBy({
        by: ['ipPrefix'],
        where: { success: false, createdAt: { gte: ago(1) } },
        _count: { _all: true },
      }),
      this.prisma.loginEvent.groupBy({
        by: ['userId'],
        where: { success: false, createdAt: { gte: ago(1) } },
        _count: { _all: true },
      }),
    ]);

    return {
      generatedAt: now,
      accounts: {
        total: accounts,
        incomplete,
        smsOnly,
        deleted,
        new7d,
        new30d,
        perWeek: perWeek(
          recentAccounts.map((u) => u.createdAt),
          now,
        ),
      },
      activity: { activeToday, active7d, active30d },
      alerts: {
        total: alertsTotal,
        running: alertsRunning,
        last30d: alerts30d,
      },
      messages: { last30d: messages30d },
      groups: { total: groups },
      security: {
        logins24h,
        failures24h,
        lockedAccounts,
        targetedAccounts: failuresByAccount.filter(
          (g) => g._count._all >= TARGETED_FAILURES,
        ).length,
        suspiciousNetworks: failuresByNetwork
          .filter((g) => g.ipPrefix && g._count._all >= SUSPICIOUS_FAILURES)
          .map((g) => ({ ipPrefix: g.ipPrefix, failures: g._count._all }))
          .sort((a, b) => b.failures - a.failures)
          .slice(0, 10),
      },
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? null,
      },
    };
  }
}

// New accounts per week, oldest week first (the last one ends now).
function perWeek(dates: Date[], now: Date) {
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => ({
    weekStart: new Date(now.getTime() - (WEEKS_SHOWN - i) * 7 * DAY_MS),
    count: 0,
  }));
  for (const d of dates) {
    const weeksAgo = Math.floor((now.getTime() - d.getTime()) / (7 * DAY_MS));
    const slot = WEEKS_SHOWN - 1 - weeksAgo;
    if (slot >= 0 && slot < WEEKS_SHOWN) weeks[slot].count += 1;
  }
  return weeks;
}
