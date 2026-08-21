import { Global, Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender.interface';
import { ConsoleEmailSenderService } from './console-email-sender.service';

@Global()
@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: ConsoleEmailSenderService }],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
