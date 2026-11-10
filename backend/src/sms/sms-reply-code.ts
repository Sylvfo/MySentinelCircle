// SMS reply codes (Sylvie, 2026-11-10): every SMS that waits for an answer
// carries a code, so a reply always says what it answers.
//   <category><slot><choice>, e.g. 211 = an alert question (2), the first
//   one waiting on this number (1), choice 1.
// The slot only changes when several things wait at once on the same
// number (two invitations, two alerts), so most people always see 111/112,
// 211/212/213, 311.
// A free-text answer starts with the two-digit code: "21 au marché".

export const SMS_CATEGORY = {
  INVITATION: 1,
  ALERT_QUESTION: 2,
  WATCH: 3,
} as const;

const MAX_SLOT = 9;

// "21" for the first alert question waiting on a number.
export function replyCode(category: number, slot: number): string {
  return `${category}${slot}`;
}

// The smallest slot not taken by what is already waiting on this number
// (all taken: the last one is reused).
export function freeSlot(taken: (number | null)[]): number {
  for (let slot = 1; slot <= MAX_SLOT; slot++) {
    if (!taken.includes(slot)) return slot;
  }
  return MAX_SLOT;
}

// "211" -> code "21", reply "1"; "21 au marché" -> code "21", reply
// "au marché". Anything else (a bare "1", "OUI", "STOP"…) -> null.
export function parseReplyCode(
  body: string,
): { code: string; reply: string } | null {
  const text = body.trim();
  const choice = /^([1-3][1-9])([1-9])$/.exec(text);
  if (choice) return { code: choice[1], reply: choice[2] };
  const free = /^([1-3][1-9])[\s:.,-]+(.+)$/s.exec(text);
  if (free) return { code: free[1], reply: free[2].trim() };
  return null;
}
