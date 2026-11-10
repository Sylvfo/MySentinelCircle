import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertModule } from '../alert/alert.module';
import { SentinelModule } from '../sentinel/sentinel.module';
import { WatchModule } from '../watch/watch.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

// The test lab (/lab), dev only: see LabService.
@Module({
  imports: [AuthModule, AlertModule, SentinelModule, WatchModule],
  providers: [LabService],
  controllers: [LabController],
})
export class LabModule {}
