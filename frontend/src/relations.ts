import type { Circle, Companion, Membership } from './api/sentinel';
import { PRIMARY_AVATAR_COLOR, PRIMARY_LEAD_COLOR, circlePalette, companionColor, companionGold } from './theme';

// Everything the app shows about one person, found in one pass over my two
// lists: they watch over me (in one of my circles), I watch over them, or
// both — or we're both in the 1st circle of someone I watch over.
export interface Relation {
  // They watch over me: their row in one of my circles, whatever its
  // status. One at most: one link ever per pair (plan.txt).
  sentinel: { circle: Circle; membership: Membership } | null;
  // I watch over them.
  companion: Companion | null;
  // Colors of the two links, the same everywhere as on My Circles (their
  // Sentinel avatar) and My Companions (their companion outline). null = no
  // such link.
  sentinelColor: string | null;
  companionColor: string | null;
  // Their profile photo's file name (PersonAvatar's cache key); null = none.
  avatarPath: string | null;
  // Their status line, as known to me (null = none, or not visible to me).
  publicStatus: string | null;
  // On pause, as far as it concerns me: a Sentinel of mine (or a 1st-circle
  // co-member) paused for others, or a companion of mine paused for me.
  paused: boolean;
  // A running subscription: the gold star.
  subscribed: boolean;
}

export function relationOf(circles: Circle[], companions: Companion[], userId: string): Relation {
  const memberships = circles.flatMap((circle) =>
    circle.userSentinels.filter((s) => s.linkAsSentinel.id === userId).map((membership) => ({ circle, membership })),
  );
  const asSentinel = memberships.map((m) => m.membership.linkAsSentinel);
  const companion = companions.find((c) => c.companion.id === userId) ?? null;
  // Seen in the 1st circle of someone I watch over.
  const coMembers = companions.flatMap((c) => c.firstCircleMembers.filter((f) => f.id === userId));

  return {
    sentinel: memberships[0] ?? null,
    companion,
    sentinelColor: sentinelColorOf(circles, memberships.find((m) => m.membership.status === 'ACCEPTED')),
    // I watch over them: gold when I'm in their 1st circle, else their own shade.
    companionColor: companion
      ? (companionGold(!!companion.leadSlot, companion.circle.isPrimary) ?? companionColor(userId))
      : null,
    avatarPath: companion ? companion.companion.avatarPath : (asSentinel[0]?.avatarPath ?? null),
    // `||`, not `??`: an empty status line counts as none.
    publicStatus:
      companion?.companion.publicStatus ||
      asSentinel.find((s) => s.publicStatus)?.publicStatus ||
      coMembers.find((f) => f.publicStatus)?.publicStatus ||
      null,
    paused:
      !!companion?.companion.pausedForMe ||
      asSentinel.some((s) => s.pausedForOthers) ||
      coMembers.some((f) => f.pausedForOthers),
    subscribed:
      !!companion?.companion.subscribed || asSentinel.some((s) => s.subscribed) || coMembers.some((f) => f.subscribed),
  };
}

// They watch over me (accepted link only): same rule as CircleRing — gold
// family in my 1st circle (darker for a Lead), otherwise their circle's own
// color.
function sentinelColorOf(circles: Circle[], accepted?: { circle: Circle; membership: Membership }): string | null {
  if (!accepted) return null;
  const { circle, membership } = accepted;
  const isLead = membership.leadSlot !== null;
  if (circle.circleType === 'FIRST') return isLead ? PRIMARY_LEAD_COLOR : PRIMARY_AVATAR_COLOR;
  if (isLead) return PRIMARY_AVATAR_COLOR;
  const others = circles.filter((c) => c.circleType !== 'FIRST' && c.circleType !== 'RESERVED');
  return circlePalette(Math.max(0, others.indexOf(circle))).color;
}
