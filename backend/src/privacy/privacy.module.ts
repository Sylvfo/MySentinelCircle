import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

// Data protection (nLPD / GDPR): the daily retention purge.
@Module({
  providers: [RetentionService],
  // SmsInboundService erases a number right after it says STOP / NON.
  exports: [RetentionService],
})
export class PrivacyModule {}
