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
import { PrismaService } from '../prisma/prisma.service';
import { OTP_SENDER } from './otp/otp-sender.interface';
import type { OtpSender } from './otp/otp-sender.interface';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async signupEmail(dto: SignupEmailDto) {
    const [emailTaken, phoneTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
    ]);
    if (emailTaken) throw new ConflictException('Email already in use');
    if (phoneTaken) throw new ConflictException('Phone already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { firstName: dto.firstName, email: dto.email, passwordHash, phone: dto.phone },
    });
    await this.sendOtp(user.id, user.phone);
    return { userId: user.id };
  }

  async signupGoogle(dto: SignupGoogleDto) {
    const { googleId, email } = await this.verifyGoogleIdToken(dto.idToken);

    const [googleTaken, phoneTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { googleId } }),
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
    ]);
    if (googleTaken) throw new ConflictException('Google account already linked to a user');
    if (phoneTaken) throw new ConflictException('Phone already in use');

    const user = await this.prisma.user.create({
      data: { firstName: dto.firstName, googleId, email, phone: dto.phone },
    });
    await this.sendOtp(user.id, user.phone);
    return { userId: user.id };
  }

  async loginEmail(dto: LoginEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    this.assertPhoneVerified(user.phoneVerifiedAt);
    return { accessToken: this.issueToken(user.id) };
  }

  async loginGoogle(dto: LoginGoogleDto) {
    const { googleId } = await this.verifyGoogleIdToken(dto.idToken);
    const user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user) throw new NotFoundException('No account linked to this Google identity');

    this.assertPhoneVerified(user.phoneVerifiedAt);
    return { accessToken: this.issueToken(user.id) };
  }

  // Fast-path phone+OTP login for an already-verified user, and OTP resend
  // for a user mid-signup whose phone isn't verified yet.
  async requestOtp(dto: RequestOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) throw new NotFoundException('No account with this phone number');

    await this.sendOtp(user.id, user.phone);
    return { userId: user.id };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
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
      throw new ForbiddenException('Phone verification is not complete for this account');
    }
  }

  private issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private async verifyGoogleIdToken(idToken: string): Promise<{ googleId: string; email: string }> {
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
