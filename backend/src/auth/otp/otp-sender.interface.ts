export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpSender {
  // language: the account's (User.language), null = French.
  send(phone: string, code: string, language?: string | null): Promise<void>;
}
