// What a free account can do and what needs paying (private users).
// The rules are in plan.txt "What's gated"; the backend enforces them,
// the frontend only explains them (frontend/src/pages/PlansPage.tsx).

// Lifetime (not yearly) free trial: alerts about a person who hasn't paid.
export const FREE_ALERT_TRIAL_LIMIT = 1;

// Error messages the frontend matches to show an "upgrade" prompt.
export const FREE_TRIAL_USED_UP =
  'Free trial alerts used up — a paid Companion account is needed to raise more';
export const GROUP_NEEDS_PAID =
  'A paid Companion account is needed to found a group circle';
export const WATCH_NEEDS_SUBSCRIPTION =
  'Watch Mode is part of the subscription';
export const DEATH_NOTICE_NEEDS_PURCHASE =
  'The death notice needs a subscription or its one-time purchase';

// Yearly subscription, each person for themself (or offered by someone
// else): active while paidUntil is in the future.
export function isSubscribed(
  user: { paidUntil: Date | null },
  now = new Date(),
): boolean {
  return user.paidUntil !== null && user.paidUntil > now;
}

// Paying (or offering) one more year: from the current end if it's still
// running, else from today — a renewal never loses days.
export function addOneYear(paidUntil: Date | null, now = new Date()): Date {
  const from = paidUntil && paidUntil > now ? paidUntil : now;
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

// The death notice: part of the subscription, or bought once on its own.
export function hasDeathNotice(user: {
  paidUntil: Date | null;
  deathNoticePurchasedAt: Date | null;
}): boolean {
  return isSubscribed(user) || user.deathNoticePurchasedAt !== null;
}

// Until a payment provider exists, the "pay" buttons only work where dev
// routes are enabled — they stand in for a real payment.
export function paymentSimulated(): boolean {
  return process.env.ALLOW_DEV_ROUTES === 'true';
}

export const PAYMENT_NOT_AVAILABLE = 'Online payment is not available yet';
