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
import {
  checkOneTimeCode,
  newOneTimeCode,
  NO_ONE_TIME_CODE,
  OTP_TTL_MINUTES,
} from '../common/one-time-code';
import { Prisma, User, UserType } from '@prisma/client';
import { CURRENT_TERMS_VERSION } from '../privacy/terms';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CIRCLES } from '../sentinel/default-circles';
import { OTP_SENDER } from './otp/otp-sender.interface';
import type { OtpSender } from './otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';
import type { EmailSender } from '../email/email-sender.interface';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

const OTP_RESEND_COOLDOWN_MS = 60_000;
const PASSWORD_RESET_TTL_MINUTES = 60;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
// Compared against when an account has no password, so that case takes as
// long to answer as a wrong password and doesn't reveal who has an account.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('no-password-here', 10);

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
    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailTaken) throw new ConflictException('Email already in use');
    const usernameTaken = await this.prisma.user.findUnique({
      where: { userName: dto.userName },
    });
    if (usernameTaken) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        userType: UserType.UNCOMPLETE,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userName: dto.userName,
        email: dto.email,
        passwordHash,
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
        gender: dto.gender,
        myCircles: { create: DEFAULT_CIRCLES },
      },
    });
    return { accessToken: this.issueToken(user.id) };
  }

  async signupGoogle(dto: SignupGoogleDto) {
    const { googleId, email } = await this.verifyGoogleIdToken(dto.idToken);

    const [googleTaken, emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { googleId } }),
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { userName: dto.userName } }),
    ]);
    if (googleTaken)
      throw new ConflictException('Google account already linked to a user');
    if (emailTaken) {
      throw new ConflictException(
        'An account already exists for this email — log in with your password, or use password reset.',
      );
    }
    if (usernameTaken) throw new ConflictException('Username already taken');

    const user = await this.prisma.user.create({
      data: {
        userType: UserType.UNCOMPLETE,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userName: dto.userName,
        googleId,
        email,
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
        gender: dto.gender,
        myCircles: { create: DEFAULT_CIRCLES },
      },
    });
    return { accessToken: this.issueToken(user.id) };
  }

  // Attaches a Google identity to the already-authenticated caller's own
  // account. Requires a valid JWT (proof the caller already owns the
  // account via password login) — deliberately not exposed as an
  // unauthenticated "link by email match" endpoint, which would let anyone
  // controlling that Gmail address silently take over an existing account.
  async linkGoogle(userId: string, idToken: string) {
    const { googleId } = await this.verifyGoogleIdToken(idToken);
    const existing = await this.prisma.user.findUnique({ where: { googleId } });
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        'This Google account is already linked to another user',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleId },
    });
    return { message: 'Google account linked' };
  }

  async loginEmail(dto: LoginEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    return this.loginWithPassword(user, dto.password);
  }

  async loginPhone(dto: LoginPhoneDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    return this.loginWithPassword(user, dto.password);
  }

  async loginGoogle(dto: LoginGoogleDto) {
    const { googleId } = await this.verifyGoogleIdToken(dto.idToken);
    const user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user)
      throw new NotFoundException('No account linked to this Google identity');

    this.assertPhoneVerified(user);
    return { accessToken: this.issueToken(user.id) };
  }

  // The single phone entry point, for signup and login alike: the same
  // answer whether or not the number is known, so it never reveals who has
  // an account. A resend inside the cooldown is silently skipped, which caps
  // SMS cost and keeps otpAttempts from being reset by asking for a new code.
  async requestOtp(dto: RequestOtpDto) {
    const user = await this.findOrCreateByPhone(dto.phone);
    if (!this.isInResendCooldown(user)) {
      await this.sendOtp(user.id, dto.phone);
    }
    return { userId: user.id };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    // A code sent for a pending number proves that number, not `phone`.
    const noPending = 'No pending OTP for this account';
    if (!user?.phone || user.pendingPhone) {
      throw new UnauthorizedException(noPending);
    }
    await checkOneTimeCode(this.prisma, user, dto.code, noPending);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...NO_ONE_TIME_CODE,
        phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
        // Just proved the phone: no second code to add a recovery email
        // or set a new password.
        stepUpVerifiedAt: new Date(),
        loginAttempts: 0,
        loginLockedUntil: null,
      },
    });
    return { accessToken: this.issueToken(user.id) };
  }

  // Works for any account with an email, password or not: this is how a
  // phone account recovers access through its recovery email, by setting a
  // password. Never reveals whether the account exists.
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user?.email) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: new Date(
            Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000,
          ),
        },
      });
      const link = `${this.config.get('FRONTEND_URL')}/reset-password?token=${rawToken}`;
      await this.emailSender.send(
        user.email,
        'Réinitialisation de mot de passe',
        link,
      );
    }
    return {
      message:
        'If an account exists for this email, a reset link has been sent.',
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.prisma.user.findUnique({
      where: { passwordResetTokenHash: tokenHash },
    });
    if (
      !user?.passwordResetExpiresAt ||
      user.passwordResetExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    return { message: 'Password updated' };
  }

  // Same answer for an unknown account, a wrong password and a lock, so a
  // login attempt never reveals who has an account. A lock only stops
  // passwords: the SMS code stays available and lifts it.
  private async loginWithPassword(user: User | null, password: string) {
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const locked = (user?.loginLockedUntil ?? new Date(0)) > new Date();
    if (!user?.passwordHash || locked || !valid) {
      if (user?.passwordHash && !locked) await this.recordLoginFailure(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertPhoneVerified(user);
    if (user.loginAttempts > 0 || user.loginLockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, loginLockedUntil: null },
      });
    }
    return { accessToken: this.issueToken(user.id) };
  }

  private async recordLoginFailure(user: User) {
    const lock = user.loginAttempts + 1 >= LOGIN_MAX_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: lock
        ? {
            loginAttempts: 0,
            loginLockedUntil: new Date(
              Date.now() + LOGIN_LOCK_MINUTES * 60_000,
            ),
          }
        : { loginAttempts: { increment: 1 } },
    });
  }

  // Every phone login starts here, so a new number gets its User row now:
  // an ONLY_SMS stub, the same shape as an invited Sentinel, completed into
  // an account by POST /user/me/complete-profile once its OTP is verified.
  private async findOrCreateByPhone(phone: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return existing;
    try {
      return await this.prisma.user.create({
        data: { phone, firstName: '', userType: UserType.ONLY_SMS },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.user.findUniqueOrThrow({ where: { phone } });
      }
      throw err;
    }
  }

  private isInResendCooldown(user: { otpExpiresAt: Date | null }) {
    if (!user.otpExpiresAt) return false;
    const sentAt = user.otpExpiresAt.getTime() - OTP_TTL_MINUTES * 60_000;
    return Date.now() - sentAt < OTP_RESEND_COOLDOWN_MS;
  }

  private async sendOtp(userId: string, phone: string) {
    const { code, fields } = await newOneTimeCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...fields, pendingPhone: null },
    });
    await this.otpSender.send(phone, code);
  }

  // Only blocks login if the account HAS a phone that isn't verified yet —
  // an account created without one (UserType.UNCOMPLETE) has nothing to
  // verify and logs in freely, just without Sentinel access (see plan.txt).
  private assertPhoneVerified(user: {
    phone: string | null;
    phoneVerifiedAt: Date | null;
  }) {
    if (user.phone && !user.phoneVerifiedAt) {
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
