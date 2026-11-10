import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';
import { otpSms, smsLang } from '../../sms/messages';
import { isProduction, maskPhone } from '../../common/log-redact';

// Dev stub — logs the code instead of sending a real SMS, and best-effort
// forwards to NoSMSNow (nosmsnow/) if NOSMSNOW_URL is set. Swap for a
// Twilio-backed implementation of OtpSender once TWILIO_* env vars exist
// (see Afaireplustard.txt), no other Auth code needs to change.
@Injectable()
export class ConsoleOtpSenderService implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSenderService.name);

  constructor(private readonly config: ConfigService) {}

  async send(
    phone: string,
    code: string,
    language?: string | null,
  ): Promise<void> {
    // Never log a usable code or the full number in production.
    this.logger.log(
      isProduction()
        ? `OTP sent to ${maskPhone(phone)}`
        : `OTP for ${phone}: ${code}`,
    );

    const nosmsnowUrl = this.config.get<string>('NOSMSNOW_URL');
    if (!nosmsnowUrl) return;
    try {
      await fetch(`${nosmsnowUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'otp',
          to: phone,
          body: otpSms(code, smsLang(language)),
        }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // NoSMSNow being down/misconfigured must never break a real send.
    }
  }
}
