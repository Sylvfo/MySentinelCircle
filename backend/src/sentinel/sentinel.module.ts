import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { SentinelService } from './sentinel.service';
import { SentinelController } from './sentinel.controller';
import { SentinelSmsController } from './sentinel-sms.controller';

@Module({
  imports: [AlertModule],
  providers: [SentinelService],
  controllers: [SentinelController, SentinelSmsController],
})
export class SentinelModule {}
