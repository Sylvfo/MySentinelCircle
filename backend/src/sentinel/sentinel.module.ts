import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { SentinelService } from './sentinel.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';

@Module({
  imports: [AlertModule],
  providers: [SentinelService],
  controllers: [SentinelController, SentinelSmsController],
  // MessagingService calls canSendDirectMessage() for the permanent
  // Me<->Sentinel channel.
  exports: [SentinelService],
})
export class SentinelModule {}
