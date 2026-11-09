import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { SentinelService } from './sentinel.service';
import { SmsInboundService } from './sms-inbound.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';
import { GroupService } from './group.service';
import { DeathNoticeService } from './death-notice.service';

@Module({
  imports: [AlertModule, PrivacyModule],
  providers: [
    SentinelService,
    GroupService,
    DeathNoticeService,
    SmsInboundService,
  ],
  controllers: [SentinelController, SentinelSmsController],
  // MessagingService calls canSendDirectMessage() for the permanent
  // Me<->Sentinel channel; account deletion leaves or deletes groups.
  exports: [SentinelService, GroupService],
})
export class SentinelModule {}
