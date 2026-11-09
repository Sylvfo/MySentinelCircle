import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginCtx } from './decorators/login-context.decorator';
import type { LoginContext } from './login-log.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('signup/email')
  signupEmail(@Body() dto: SignupEmailDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.signupEmail(dto, ctx);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('signup/google')
  signupGoogle(@Body() dto: SignupGoogleDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.signupGoogle(dto, ctx);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login/email')
  loginEmail(@Body() dto: LoginEmailDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.loginEmail(dto, ctx);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login/phone')
  loginPhone(@Body() dto: LoginPhoneDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.loginPhone(dto, ctx);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login/google')
  loginGoogle(@Body() dto: LoginGoogleDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.loginGoogle(dto, ctx);
  }

  // Used both to (re)send the code during signup and as the phone+OTP
  // fast-path login for an already-verified account.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @LoginCtx() ctx: LoginContext) {
    return this.authService.verifyOtp(dto, ctx);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  // Attaches a Google identity to the caller's own already-authenticated
  // account — requires a JWT (proof of ownership via password login), not
  // exposed as an unauthenticated "link by email match" endpoint.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('link/google')
  linkGoogle(
    @CurrentUser() user: { userId: string },
    @Body() dto: LoginGoogleDto,
  ) {
    return this.authService.linkGoogle(user.userId, dto.idToken);
  }

  // My last sign-in attempts (successful or not), for my Settings.
  @UseGuards(JwtAuthGuard)
  @Get('logins')
  myLogins(@CurrentUser() user: { userId: string }) {
    return this.authService.listMyLogins(user.userId);
  }

  // Signs this account out of every device, this one included.
  @UseGuards(JwtAuthGuard)
  @Post('logout-everywhere')
  logoutEverywhere(@CurrentUser() user: { userId: string }) {
    return this.authService.logoutEverywhere(user.userId);
  }
}
