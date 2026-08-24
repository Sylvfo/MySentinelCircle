import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender.interface';

// Dev stub — logs the email instead of sending it, and best-effort forwards
// to NoSMSNow (nosmsnow/) if NOSMSNOW_URL is set, so it shows up in the same
// terminal as SMS/OTP sends during dev. Swap for a real provider once one is
// chosen; no caller needs to change.
@Injectable()
export class ConsoleEmailSenderService implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSenderService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`Email to ${to} [${subject}]: ${body}`);

    const nosmsnowUrl = this.config.get<string>('NOSMSNOW_URL');
    if (!nosmsnowUrl) return;
    try {
      await fetch(`${nosmsnowUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', to, subject, body }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // NoSMSNow being down/misconfigured must never break a real send.
    }
  }
}
