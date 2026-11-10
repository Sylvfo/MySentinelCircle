import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { WatchModule } from '../watch/watch.module';
import { SentinelService } from './sentinel.service';
import { SmsInboundService } from './sms-inbound.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';
import { GroupService } from './group.service';
import { DeathNoticeService } from './death-notice.service';
import { PhoneRecoveryService } from './phone-recovery.service';
import { PhoneRecoveryController } from './phone-recovery.controller';
import { ConnectService } from './connect.service';
import { ConnectController } from './connect.controller';

@Module({
  // WatchModule: the OK reply to a Watch Mode reminder (one inbound SMS
  // webhook for the whole app), and what companions see of a watch.
  imports: [AlertModule, PrivacyModule, WatchModule],
  providers: [
    SentinelService,
    GroupService,
    DeathNoticeService,
    PhoneRecoveryService,
    SmsInboundService,
    ConnectService,
  ],
  controllers: [
    SentinelController,
    SentinelSmsController,
    PhoneRecoveryController,
    ConnectController,
  ],
  // MessagingService calls canSendDirectMessage() for the permanent
  // Me<->Sentinel channel; account deletion leaves or deletes groups.
  exports: [SentinelService, GroupService, SmsInboundService],
})
export class SentinelModule {}
