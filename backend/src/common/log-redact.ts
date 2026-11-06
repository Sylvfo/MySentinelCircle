// Personal data must not end up in production logs (nLPD / GDPR): phone
// numbers, email addresses, OTP codes and message bodies. In dev the full
// content stays visible, since the console senders are how we read SMS/OTP.

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// "+41791234567" -> "+41•••••67": enough to tell sends apart, not to call.
export function maskPhone(phone: string): string {
  if (phone.length <= 5) return '•••';
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`;
}

// "sylvie@example.ch" -> "s•••@example.ch".
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
