import { Module } from '@nestjs/common';
import { SentinelService } from './sentinel.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';

@Module({
  providers: [SentinelService],
  controllers: [SentinelController, SentinelSmsController],
})
export class SentinelModule {}
