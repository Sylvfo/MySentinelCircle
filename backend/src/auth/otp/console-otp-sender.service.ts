import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';

// Dev stub — logs the code instead of sending a real SMS, and best-effort
// forwards to NoSMSNow (nosmsnow/) if NOSMSNOW_URL is set. Swap for a
// Twilio-backed implementation of OtpSender once TWILIO_* env vars exist
// (see Afaireplustard.txt), no other Auth code needs to change.
@Injectable()
export class ConsoleOtpSenderService implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSenderService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);

    const nosmsnowUrl = this.config.get<string>('NOSMSNOW_URL');
    if (!nosmsnowUrl) return;
    try {
      await fetch(`${nosmsnowUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'otp', to: phone, body: `Code: ${code}` }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // NoSMSNow being down/misconfigured must never break a real send.
    }
  }
}
