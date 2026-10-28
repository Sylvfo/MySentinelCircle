import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { PUSH_SENDER } from './push-sender.interface';
import { ConsolePushSenderService } from './console-push-sender.service';

// @Global() because alert/sentinel/messaging all call NotificationService
// directly from deep inside their own transactions — same reason
// RealtimeModule/SmsModule are global. PUSH_SENDER stays unexported: only
// NotificationService itself ever needs to push.
@Global()
@Module({
  providers: [
    NotificationService,
    { provide: PUSH_SENDER, useClass: ConsolePushSenderService },
  ],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
