import { Module } from '@nestjs/common';
import { SentinelModule } from '../sentinel/sentinel.module';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';

@Module({
  imports: [SentinelModule],
  providers: [MessagingService],
  controllers: [MessagingController],
})
export class MessagingModule {}
