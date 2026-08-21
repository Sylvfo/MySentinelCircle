import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { User, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from './otp/otp-sender.interface';
import type { OtpSender } from './otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';
import type { EmailSender } from '../email/email-sender.interface';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { SignupPhoneDto } from './dto/signup-phone.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async signupEmail(dto: SignupEmailDto) {
    const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (emailTaken) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.claimOrCreateByPhone(
      dto.phone,
      { firstName: dto.firstName, email: dto.email, passwordHash },
      UserType.ACCOUNT,
    );
    await this.sendOtp(user.id, dto.phone);
    return { userId: user.id };
  }

  async signupGoogle(dto: SignupGoogleDto) {
    const { googleId, email } = await this.verifyGoogleIdToken(dto.idToken);

    const [googleTaken, emailTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { googleId } }),
      this.prisma.user.findUnique({ where: { email } }),
    ]);
    if (googleTaken)
      throw new ConflictException('Google account already linked to a user');
    if (emailTaken) {
      throw new ConflictException(
        'An account already exists for this email — log in with your password, or use password reset.',
      );
    }

    const user = await this.claimOrCreateByPhone(
      dto.phone,
      { firstName: dto.firstName, googleId, email },
      UserType.ACCOUNT,
    );
    await this.sendOtp(user.id, dto.phone);
    return { userId: user.id };
  }

  async signupPhone(dto: SignupPhoneDto) {
    const user = await this.claimOrCreateByPhone(
      dto.phone,
      { firstName: dto.firstName },
      UserType.ACCOUNT,
    );
    await this.sendOtp(user.id, dto.phone);
    return { userId: user.id };
  }

  async loginEmail(dto: LoginEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.passwordHash)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    this.assertPhoneVerified(user.phoneVerifiedAt);
    return { accessToken: this.issueToken(user.id) };
  }

  async loginGoogle(dto: LoginGoogleDto) {
    const { googleId } = await this.verifyGoogleIdToken(dto.idToken);
    const user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user)
      throw new NotFoundException('No account linked to this Google identity');

    this.assertPhoneVerified(user.phoneVerifiedAt);
    return { accessToken: this.issueToken(user.id) };
  }

  // Fast-path phone+OTP login for an already-verified user, and OTP resend
  // for a user mid-signup whose phone isn't verified yet.
  async requestOtp(dto: RequestOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user) throw new NotFoundException('No account with this phone number');

    await this.sendOtp(user.id, dto.phone);
    return { userId: user.id };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
      throw new UnauthorizedException('No pending OTP for this account');
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts, request a new code');
    }
    if (user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('Code expired, request a new one');
    }

    const valid = await bcrypt.compare(dto.code, user.otpCodeHash);
    if (!valid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
      },
    });
    return { accessToken: this.issueToken(user.id) };
  }

  // Only relevant to accounts with a password (email+password signup) — n/a
  // for Google-only or phone-only accounts, which have no passwordHash.
  // Never reveals whether the account exists or has a password at all.
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (user?.passwordHash) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
        },
      });
      const link = `${this.config.get('FRONTEND_URL')}/reset-password?token=${rawToken}`;
      await this.emailSender.send(user.email!, 'Réinitialisation de mot de passe', link);
    }
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
    if (!user?.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    return { message: 'Password updated' };
  }

  // A sentinel+companion phone can already exist as a passive "Sentinel
  // stub" User row (firstName+phone only, userType ONLY_SMS) created by
  // sentinel.service.ts's findOrCreateUserByPhone. Signing up with that same
  // phone should CLAIM that row into a real account (same id, so existing
  // LinkSentinels rows keep resolving) rather than being blocked forever.
  // A phone already belonging to a real account (userType !== ONLY_SMS) is
  // rejected as taken.
  private async claimOrCreateByPhone(
    phone: string,
    credentials: { firstName: string; email?: string; passwordHash?: string; googleId?: string },
    userType: UserType,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    if (!existing) {
      return this.prisma.user.create({ data: { phone, userType, ...credentials } });
    }
    if (existing.userType !== UserType.ONLY_SMS) {
      throw new ConflictException('Phone already in use');
    }
    return this.prisma.user.update({ where: { id: existing.id }, data: { userType, ...credentials } });
  }

  private async sendOtp(userId: string, phone: string) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otpCodeHash = await bcrypt.hash(code, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        otpAttempts: 0,
      },
    });
    await this.otpSender.send(phone, code);
  }

  private assertPhoneVerified(phoneVerifiedAt: Date | null) {
    if (!phoneVerifiedAt) {
      throw new ForbiddenException(
        'Phone verification is not complete for this account',
      );
    }
  }

  private issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private async verifyGoogleIdToken(
    idToken: string,
  ): Promise<{ googleId: string; email: string }> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.config.get('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return { googleId: payload.sub, email: payload.email };
  }
}
