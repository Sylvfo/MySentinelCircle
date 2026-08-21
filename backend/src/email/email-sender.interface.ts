export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

// General-purpose outbound email abstraction, mirroring SmsSender's shape.
// Dev stub logs to console; swap for a real provider (SendGrid, SES, etc.)
// once one is chosen — no caller changes.
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}
