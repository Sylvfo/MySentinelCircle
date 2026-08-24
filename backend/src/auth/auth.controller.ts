import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { SignupPhoneDto } from './dto/signup-phone.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup/email')
  signupEmail(@Body() dto: SignupEmailDto) {
    return this.authService.signupEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup/google')
  signupGoogle(@Body() dto: SignupGoogleDto) {
    return this.authService.signupGoogle(dto);
  }

  // Full, permanent account from just a phone number — no email/Google
  // ever required. Login afterwards: otp/request + otp/verify.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup/phone')
  signupPhone(@Body() dto: SignupPhoneDto) {
    return this.authService.signupPhone(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/email')
  loginEmail(@Body() dto: LoginEmailDto) {
    return this.authService.loginEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/google')
  loginGoogle(@Body() dto: LoginGoogleDto) {
    return this.authService.loginGoogle(dto);
  }

  // Used both to (re)send the code during signup and as the phone+OTP
  // fast-path login for an already-verified account.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        phoneVerifiedAt: true,
        createdAt: true,
      },
    });
    return record;
  }
}
