export const SMS_SENDER = Symbol('SMS_SENDER');

// General-purpose outbound SMS abstraction, separate from the OTP-specific
// OtpSender. Dev stub logs to console; swap for a Twilio-backed impl once
// TWILIO_* env vars exist (see Afaireplustard.txt) — no caller changes.
export interface SmsSender {
  send(phone: string, body: string): Promise<void>;
}
