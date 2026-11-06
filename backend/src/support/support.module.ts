import { Global, Module } from '@nestjs/common';
import { SupportService } from './support.service';

// Global like NotificationModule: messaging and notification both need to
// know which account is the feedback inbox.
@Global()
@Module({
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
