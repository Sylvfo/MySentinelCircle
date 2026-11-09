import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PhoneRecoveryService } from './phone-recovery.service';
import {
  RequestPhoneRecoveryDto,
  VerifyPhoneRecoveryDto,
} from './dto/phone-recovery.dto';

// Lost phone. Asking and finishing happen signed out (under /auth/, which
// nginx forwards); the 1st circle answers signed in (under /sentinel/).
@Controller()
export class PhoneRecoveryController {
  constructor(private readonly recovery: PhoneRecoveryService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/phone-recovery/request')
  request(@Body() dto: RequestPhoneRecoveryDto) {
    return this.recovery.request(dto.phone.trim(), dto.newPhone.trim());
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/phone-recovery/verify')
  verify(@Body() dto: VerifyPhoneRecoveryDto) {
    return this.recovery.verify(dto.newPhone.trim(), dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sentinel/companions/:companionId/phone-recovery/confirm')
  confirm(
    @CurrentUser() user: { userId: string },
    @Param('companionId') companionId: string,
  ) {
    return this.recovery.confirm(user.userId, companionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sentinel/companions/:companionId/phone-recovery/reject')
  reject(
    @CurrentUser() user: { userId: string },
    @Param('companionId') companionId: string,
  ) {
    return this.recovery.reject(user.userId, companionId);
  }
}
