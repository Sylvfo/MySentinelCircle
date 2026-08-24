import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { UserType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import type { OtpSender } from '../auth/otp/otp-sender.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

export const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');

const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userName: true,
  email: true,
  phone: true,
  phoneVerifiedAt: true,
  status: true,
  userType: true,
  isMajor: true,
  publicStatus: true,
  createdAt: true,
  updatedAt: true,
  avatarPath: true,
} as const;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
  ) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.userName) {
      const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { userName: true } });
      if (current?.userName) {
        throw new ConflictException('Username cannot be changed once set');
      }
      const taken = await this.prisma.user.findUnique({ where: { userName: dto.userName } });
      if (taken && taken.id !== userId) throw new ConflictException('Username already taken');
    }
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: PROFILE_SELECT });
  }

  // Phone can be added after signup for an account created without one
  // (UserType.UNCOMPLETE). If the phone already belongs to a passive
  // Sentinel-stub (ONLY_SMS, created when someone invited that number
  // before its owner had an account), that stub is claimed into the
  // caller's own account instead of being rejected: its LinkSentinels rows
  // move onto the caller, and the stub row is anonymized (never deleted,
  // per the schema's historization rule) rather than kept dangling.
  async requestAddPhone(userId: string, phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    if (existing && existing.id !== userId) {
      if (existing.userType !== UserType.ONLY_SMS) {
        throw new ConflictException('Phone already in use');
      }
      await this.prisma.$transaction([
        this.prisma.linkSentinels.updateMany({
          where: { userSentinelId: existing.id },
          data: { userSentinelId: userId },
        }),
        this.prisma.user.update({
          where: { id: existing.id },
          data: { phone: null, status: UserStatus.DELETED, deletedAt: new Date() },
        }),
      ]);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otpCodeHash = await bcrypt.hash(code, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone,
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        otpAttempts: 0,
      },
    });
    await this.otpSender.send(phone, code);
    return { message: 'Code sent' };
  }

  async verifyAddPhone(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.otpCodeHash || !user.otpExpiresAt) {
      throw new UnauthorizedException('No pending code');
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts, request a new code');
    }
    if (user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('Code expired, request a new one');
    }

    const valid = await bcrypt.compare(code, user.otpCodeHash);
    if (!valid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        phoneVerifiedAt: new Date(),
        userType: user.userType === UserType.UNCOMPLETE ? UserType.ACCOUNT : user.userType,
      },
      select: PROFILE_SELECT,
    });
  }

  // One photo per user, never accumulated: the previous file (if any, and
  // if different from the new one) is removed once the new one is saved.
  async setAvatar(userId: string, filename: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (user?.avatarPath && user.avatarPath !== filename) {
      await unlink(join(AVATAR_DIR, user.avatarPath)).catch(() => {});
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: filename },
      select: PROFILE_SELECT,
    });
  }
}
