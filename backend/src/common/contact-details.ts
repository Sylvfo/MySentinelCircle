// Spots a phone number or an email address in a message, so alert chats can
// refuse them when the person the alert is about doesn't want their
// Sentinels to reach each other outside the app (User.alertContactSharing).
// Errs on the side of everyday text: dates, times and amounts are not
// numbers to call.

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;

// +41 79 123 45 67, 0041 79…, 079 123 45 67, 06 12 34 56 78, 079-123.45.67
const PHONE = /(?:\+|\b0)\d(?:[\s.\-/()]?\d){7,}/g;

// 09.11.2026 or 9/11/26 at the start of a match: a date, maybe followed by
// a time, not a phone number. Not when a 4th group follows (06.12.34.56.78).
const DATE_START = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?![./-]\d)/;

export function containsContactDetails(text: string): boolean {
  if (EMAIL.test(text)) return true;
  for (const match of text.matchAll(PHONE)) {
    const candidate = match[0];
    if (DATE_START.test(candidate)) continue;
    const digits = candidate.replace(/\D/g, '').length;
    // A national number has 10 digits (CH, FR), an international one more.
    if (digits >= 10 || (candidate.startsWith('+') && digits >= 9)) {
      return true;
    }
  }
  return false;
}
