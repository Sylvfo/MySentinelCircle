// Lowercase, no accents, no punctuation: the one form every inbound-SMS parser
// compares against.
export function normalizeSmsText(body: string): string {
  return body
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
