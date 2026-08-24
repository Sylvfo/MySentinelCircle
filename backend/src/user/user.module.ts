import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import { ConsoleOtpSenderService } from '../auth/otp/console-otp-sender.service';

@Module({
  providers: [UserService, { provide: OTP_SENDER, useClass: ConsoleOtpSenderService }],
  controllers: [UserController],
})
export class UserModule {}
