import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';

// Deliberately separate from UserController (no class-level JwtAuthGuard):
// the user clicks a link from their email client, not necessarily logged
// in on that device/browser — same reasoning as auth's password-reset/confirm.
@Controller('user')
export class EmailConfirmationController {
  constructor(private readonly userService: UserService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('confirm-email')
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.userService.confirmEmailChange(dto.token);
  }
}
