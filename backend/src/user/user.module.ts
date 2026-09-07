import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { EmailConfirmationController } from './email-confirmation.controller';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import { ConsoleOtpSenderService } from '../auth/otp/console-otp-sender.service';
import { EMAIL_SENDER } from '../email/email-sender.interface';
import { ConsoleEmailSenderService } from '../email/console-email-sender.service';

@Module({
  providers: [
    UserService,
    { provide: OTP_SENDER, useClass: ConsoleOtpSenderService },
    { provide: EMAIL_SENDER, useClass: ConsoleEmailSenderService },
  ],
  controllers: [UserController, EmailConfirmationController],
})
export class UserModule {}
