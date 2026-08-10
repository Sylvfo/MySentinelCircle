export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}
