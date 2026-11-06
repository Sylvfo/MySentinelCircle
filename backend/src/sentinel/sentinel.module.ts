import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { SentinelService } from './sentinel.service';
import { SmsInboundService } from './sms-inbound.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';

@Module({
  imports: [AlertModule, PrivacyModule],
  providers: [SentinelService, SmsInboundService],
  controllers: [SentinelController, SentinelSmsController],
  // MessagingService calls canSendDirectMessage() for the permanent
  // Me<->Sentinel channel.
  exports: [SentinelService],
})
export class SentinelModule {}
