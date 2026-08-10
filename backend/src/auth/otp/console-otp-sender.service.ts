import { Injectable, Logger } from '@nestjs/common';
import { OtpSender } from './otp-sender.interface';

// Dev stub — logs the code instead of sending a real SMS. Swap for a
// Twilio-backed implementation of OtpSender once TWILIO_* env vars exist
// (see Afaireplustard.txt), no other Auth code needs to change.
@Injectable()
export class ConsoleOtpSenderService implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSenderService.name);

  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}
