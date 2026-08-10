import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms-sender.interface';

// Dev stub — logs the SMS instead of sending it. Swap for a Twilio-backed
// implementation of SmsSender once TWILIO_* env vars exist, no caller
// needs to change.
@Injectable()
export class ConsoleSmsSenderService implements SmsSender {
  private readonly logger = new Logger(ConsoleSmsSenderService.name);

  async send(phone: string, body: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${body}`);
  }
}
