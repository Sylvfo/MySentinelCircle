// How solid someone's safety net is. Reaching `ready` takes three things:
// their own verified phone, a Lead Sentinel with a phone, and one other
// Sentinel with a phone. It sits at a third of the bar on purpose: from
// there, every Sentinel with a phone adds to it, and 10 is already very good.
const CONDITION_POINTS = 11;
const READY_SCORE = 33;
const READY_SENTINELS = 2;
const GREAT_SENTINELS = 10;
const GREAT_SCORE = 80;
const POINTS_PER_EXTRA_SENTINEL = 2;

export type SecurityLevel =
  'notReady' | 'minimum' | 'fair' | 'good' | 'great' | 'excellent';

export type SecurityRequirement = 'phone' | 'lead' | 'sentinel';

function levelFor(sentinels: number): SecurityLevel {
  if (sentinels >= 20) return 'excellent';
  if (sentinels >= GREAT_SENTINELS) return 'great';
  if (sentinels >= 6) return 'good';
  if (sentinels >= 3) return 'fair';
  return 'minimum';
}

function scoreFor(sentinels: number): number {
  if (sentinels <= GREAT_SENTINELS) {
    const perSentinel =
      (GREAT_SCORE - READY_SCORE) / (GREAT_SENTINELS - READY_SENTINELS);
    return Math.round(
      READY_SCORE + perSentinel * (sentinels - READY_SENTINELS),
    );
  }
  const extra = sentinels - GREAT_SENTINELS;
  return Math.min(100, GREAT_SCORE + POINTS_PER_EXTRA_SENTINEL * extra);
}

export function computeSecurityScore(input: {
  hasVerifiedPhone: boolean;
  hasLeadWithPhone: boolean;
  sentinelsWithPhone: number;
}) {
  const { hasVerifiedPhone, hasLeadWithPhone, sentinelsWithPhone } = input;
  const otherSentinels = sentinelsWithPhone - (hasLeadWithPhone ? 1 : 0);

  const missing: SecurityRequirement[] = [];
  if (!hasVerifiedPhone) missing.push('phone');
  if (!hasLeadWithPhone) missing.push('lead');
  if (otherSentinels < 1) missing.push('sentinel');

  if (missing.length > 0) {
    return {
      score: (3 - missing.length) * CONDITION_POINTS,
      level: 'notReady' as SecurityLevel,
      ready: false,
      missing,
    };
  }
  return {
    score: scoreFor(sentinelsWithPhone),
    level: levelFor(sentinelsWithPhone),
    ready: true,
    missing,
  };
}
