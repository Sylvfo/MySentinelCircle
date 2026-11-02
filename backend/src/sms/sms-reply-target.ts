import { ACCEPT_KEYWORDS, DECLINE_KEYWORDS } from './messages';
import { normalizeSmsText } from './normalize-sms';

const MIN_NAME_LETTERS = 3;

export interface SmsReplyTarget {
  index: number;
  reply: string;
}

// Reads "Gabriel 1" or "Gab OUI": the start of a first name says which request
// a reply is for, with nothing to remember between two messages. Null without
// a name, or when the letters fit several people.
export function findReplyTarget(
  body: string,
  names: string[],
): SmsReplyTarget | null {
  const match = /^([\p{L}-]+)[\s:,.-]*(.*)$/su.exec(body.trim());
  if (!match) return null;
  const [, word, reply] = match;

  const letters = normalizeSmsText(word);
  if (
    !reply ||
    letters.length < MIN_NAME_LETTERS ||
    ACCEPT_KEYWORDS.includes(letters) ||
    DECLINE_KEYWORDS.includes(letters)
  ) {
    return null;
  }

  const matches = names.flatMap((name, index) =>
    normalizeSmsText(name).startsWith(letters) ? [index] : [],
  );
  return matches.length === 1 ? { index: matches[0], reply } : null;
}
