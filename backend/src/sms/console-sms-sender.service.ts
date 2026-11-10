import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms-sender.interface';
import { isProduction, maskPhone } from '../common/log-redact';
import { PrismaService } from '../prisma/prisma.service';

// Dev stub — logs the SMS instead of sending it, and best-effort forwards to
// NoSMSNow (nosmsnow/) if NOSMSNOW_URL is set, so it shows up in that
// terminal too. Swap for a Twilio-backed implementation of SmsSender once
// TWILIO_* env vars exist, no caller needs to change.
@Injectable()
export class ConsoleSmsSenderService implements SmsSender {
  private readonly logger = new Logger(ConsoleSmsSenderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async send(phone: string, body: string): Promise<void> {
    // No number or content in production logs (personal data).
    this.logger.log(
      isProduction()
        ? `SMS to ${maskPhone(phone)} (${body.length} chars)`
        : `SMS to ${phone}: ${body}`,
    );

    // Test lab (dev only): a copy for the test phones' SMS screens.
    if (this.config.get('ALLOW_DEV_ROUTES') === 'true') {
      await this.prisma.labSms
        .create({ data: { phone, body, direction: 'OUT' } })
        .catch(() => undefined);
    }

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
