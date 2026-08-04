import { Module } from '@nestjs/common';
import { SentinelService } from './sentinel.service';
import { SentinelController } from './sentinel.controller';

@Module({
  providers: [SentinelService],
  controllers: [SentinelController]
})
export class SentinelModule {}
