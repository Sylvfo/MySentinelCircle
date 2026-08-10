import { Body, Controller, Post } from '@nestjs/common';
import { SentinelService } from './sentinel.service';
import { InboundSmsDto } from './dto/inbound-sms.dto';

// Inbound SMS webhook — deliberately unauthenticated (the SMS provider calls
// it, not a logged-in user). In prod, secure it with the provider's signature
// check. Lets a Sentinel accept/decline an invitation by replying OUI / NON.
@Controller('sentinel/sms')
export class SentinelSmsController {
  constructor(private readonly sentinel: SentinelService) {}

  @Post('inbound')
  inbound(@Body() dto: InboundSmsDto) {
    return this.sentinel.handleInboundSms(dto.from, dto.body);
  }
}
