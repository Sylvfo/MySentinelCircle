import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms-sender.interface';

// Dev stub — logs the SMS instead of sending it, and best-effort forwards to
// NoSMSNow (nosmsnow/) if NOSMSNOW_URL is set, so it shows up in that
// terminal too. Swap for a Twilio-backed implementation of SmsSender once
// TWILIO_* env vars exist, no caller needs to change.
@Injectable()
export class ConsoleSmsSenderService implements SmsSender {
  private readonly logger = new Logger(ConsoleSmsSenderService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, body: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${body}`);

    const nosmsnowUrl = this.config.get<string>('NOSMSNOW_URL');
    if (!nosmsnowUrl) return;
    try {
      await fetch(`${nosmsnowUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'sms', to: phone, body }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // NoSMSNow being down/misconfigured must never break a real send.
    }
  }
}
