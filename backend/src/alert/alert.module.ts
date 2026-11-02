import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';

@Module({
  providers: [AlertService],
  controllers: [AlertController],
  // SentinelService delegates to it as an inbound-SMS fallback (one webhook
  // for the whole app, see sms-inbound.service.ts).
  exports: [AlertService],
})
export class AlertModule {}
