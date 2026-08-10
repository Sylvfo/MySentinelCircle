import { Global, Module } from '@nestjs/common';
import { SMS_SENDER } from './sms-sender.interface';
import { ConsoleSmsSenderService } from './console-sms-sender.service';

// Global so any feature module (Sentinel, Alert, Messaging...) can inject
// SMS_SENDER without re-wiring the provider each time.
@Global()
@Module({
  providers: [{ provide: SMS_SENDER, useClass: ConsoleSmsSenderService }],
  exports: [SMS_SENDER],
})
export class SmsModule {}
