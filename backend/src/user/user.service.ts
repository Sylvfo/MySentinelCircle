import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { UserType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import type { OtpSender } from '../auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';
import type { EmailSender } from '../email/email-sender.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StepUpCodeRequestDto } from './dto/step-up-code-request.dto';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const STEP_UP_TTL_MINUTES = 10;
const PENDING_EMAIL_TTL_MINUTES = 60;

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
  passwordHash: true,
  googleId: true,
} as const;

// Never return the raw hash/id — just whether they exist, so the frontend
// knows which credentials/step-up methods apply to this account.
function toProfileDto<
  T extends { passwordHash: string | null; googleId: string | null },
>(user: T) {
  const { passwordHash, googleId, ...rest } = user;
  return {
    ...rest,
    hasPassword: passwordHash !== null,
    hasGoogle: googleId !== null,
  };
}

@Injectable()
export class UserService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    return user && toProfileDto(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.userName) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userName: true },
      });
      if (current?.userName) {
        throw new ConflictException('Username cannot be changed once set');
      }
      const taken = await this.prisma.user.findUnique({
        where: { userName: dto.userName },
      });
      if (taken && taken.id !== userId)
        throw new ConflictException('Username already taken');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PROFILE_SELECT,
    });
    return toProfileDto(user);
  }

  // Phone can be added after signup for an account created without one
  // (UserType.UNCOMPLETE). If the phone already belongs to a passive
  // Sentinel-stub (ONLY_SMS, created when someone invited that number
  // before its owner had an account), that stub is claimed into the
  // caller's own account instead of being rejected: its LinkSentinels rows
  // move onto the caller, and the stub row is anonymized (never deleted,
  // per the schema's historization rule) rather than kept dangling.
  // If the caller already has a phone (this is a CHANGE, not a first add),
  // a fresh step-up verification is required first — same as email change.
  async requestAddPhone(userId: string, phone: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: userId } });
    if (caller?.phone) {
      this.assertStepUpFresh(caller);
    }

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
          data: {
            phone: null,
            status: UserStatus.DELETED,
            deletedAt: new Date(),
          },
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        phoneVerifiedAt: new Date(),
        userType:
          user.userType === UserType.UNCOMPLETE
            ? UserType.ACCOUNT
            : user.userType,
      },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  // Requires the current password as proof — no separate "old channel"
  // verification needed, unlike email/phone changes, since the password
  // itself already is that proof.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('This account has no password to change');
    }
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Password updated' };
  }

  // --- Step-up identity re-verification ---------------------------------
  // Gate in front of changing email or an already-set phone: prove it's
  // still you via ANY credential the account already has, not necessarily
  // the specific one being changed. This is what answers "I lost my old
  // phone" — use password, Google, or a code to whichever channel (phone
  // or email) is still accessible instead of the one that's gone.

  async stepUpPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash)
      throw new UnauthorizedException('This account has no password');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  async stepUpGoogle(userId: string, idToken: string) {
    const { googleId } = await this.verifyGoogleIdToken(idToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.googleId || user.googleId !== googleId) {
      throw new UnauthorizedException(
        'Google identity does not match this account',
      );
    }
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  async stepUpCodeRequest(userId: string, dto: StepUpCodeRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otpCodeHash = await bcrypt.hash(code, 10);

    if (dto.channel === 'phone') {
      if (!user?.phone || !user.phoneVerifiedAt) {
        throw new UnauthorizedException('No verified phone on this account');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
          otpAttempts: 0,
        },
      });
      await this.otpSender.send(user.phone, code);
    } else {
      if (!user?.email)
        throw new UnauthorizedException('No email on this account');
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          otpCodeHash,
          otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
          otpAttempts: 0,
        },
      });
      await this.emailSender.send(user.email, 'Code de vérification', code);
    }
    return { message: 'Code sent' };
  }

  async stepUpCodeVerify(userId: string, code: string) {
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  private async markStepUpVerified(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { stepUpVerifiedAt: new Date() },
    });
  }

  // Throws unless step-up was completed in the last STEP_UP_TTL_MINUTES —
  // called before any sensitive change (email, or a phone that's already set).
  private assertStepUpFresh(user: { stepUpVerifiedAt: Date | null }) {
    const freshEnough =
      user.stepUpVerifiedAt &&
      user.stepUpVerifiedAt >
        new Date(Date.now() - STEP_UP_TTL_MINUTES * 60_000);
    if (!freshEnough) {
      throw new UnauthorizedException('Please re-verify your identity first');
    }
  }

  private async verifyGoogleIdToken(
    idToken: string,
  ): Promise<{ googleId: string }> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.config.get('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new UnauthorizedException('Invalid Google token');
    return { googleId: payload.sub };
  }

  // --- Change email -------------------------------------------------------
  // Requires a fresh step-up (proof it's still the account owner) before
  // even starting — then a link sent to the NEW address confirms ownership
  // of it. The change only applies once that link is clicked.

  async requestEmailChange(userId: string, newEmail: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!caller) throw new UnauthorizedException('Account not found');
    this.assertStepUpFresh(caller);

    const taken = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });
    if (taken && taken.id !== userId)
      throw new ConflictException('Email already in use');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: newEmail,
        pendingEmailTokenHash: tokenHash,
        pendingEmailExpiresAt: new Date(
          Date.now() + PENDING_EMAIL_TTL_MINUTES * 60_000,
        ),
      },
    });
    const link = `${this.config.get('FRONTEND_URL')}/confirm-email?token=${rawToken}`;
    await this.emailSender.send(
      newEmail,
      'Confirme ta nouvelle adresse email',
      link,
    );
    return { message: 'Confirmation link sent to the new email' };
  }

  // Public (no auth) — the user clicks a link from their email client,
  // possibly on a different device than the one that requested the change.
  async confirmEmailChange(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({
      where: { pendingEmailTokenHash: tokenHash },
    });
    if (
      !user?.pendingEmail ||
      !user.pendingEmailExpiresAt ||
      user.pendingEmailExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired confirmation link');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        pendingEmailTokenHash: null,
        pendingEmailExpiresAt: null,
      },
    });
    return { message: 'Email updated' };
  }

  // One photo per user, never accumulated: the previous file (if any, and
  // if different from the new one) is removed once the new one is saved.
  async setAvatar(userId: string, filename: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPath: true },
    });
    if (user?.avatarPath && user.avatarPath !== filename) {
      await unlink(join(AVATAR_DIR, user.avatarPath)).catch(() => {});
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: filename },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }
}
