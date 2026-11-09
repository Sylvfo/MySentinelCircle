import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { OuterCirclesService } from './outer-circles.service';

@Module({
  providers: [AlertService, OuterCirclesService],
  controllers: [AlertController],
  // SentinelService delegates to it as an inbound-SMS fallback (one webhook
  // for the whole app, see sms-inbound.service.ts).
  exports: [AlertService, OuterCirclesService],
})
export class AlertModule {}
