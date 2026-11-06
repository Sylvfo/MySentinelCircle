import type { Circle, Companion } from './api/sentinel';
import { PRIMARY_AVATAR_COLOR, PRIMARY_LEAD_COLOR, circlePalette, companionColor, companionGold } from './theme';

// Colors of the two possible links with one person, so they look the same
// everywhere as on My Circles (their Sentinel avatar) and My Companions
// (their companion outline). null = no such link.

// They watch over me: same rule as CircleRing — gold family in my 1st circle
// (darker for a Lead), otherwise their circle's own color.
export function mySentinelColor(circles: Circle[], userId: string): string | null {
  const others = circles.filter((c) => c.circleType !== 'FIRST' && c.circleType !== 'RESERVED');
  for (const c of circles) {
    const m = c.userSentinels.find((s) => s.linkAsSentinel.id === userId && s.status === 'ACCEPTED');
    if (!m) continue;
    const isLead = m.leadSlot !== null;
    if (c.circleType === 'FIRST') return isLead ? PRIMARY_LEAD_COLOR : PRIMARY_AVATAR_COLOR;
    if (isLead) return PRIMARY_AVATAR_COLOR;
    return circlePalette(Math.max(0, others.indexOf(c))).color;
  }
  return null;
}

// I watch over them: gold when I'm in their 1st circle, else their own shade.
export function myCompanionColor(companions: Companion[], userId: string): string | null {
  const c = companions.find((x) => x.companion.id === userId);
  if (!c) return null;
  return companionGold(!!c.leadSlot, c.circle.isPrimary) ?? companionColor(userId);
}

// Their profile photo's file name, from whichever list knows them (null =
// no photo). Used as PersonAvatar's cache key.
export function avatarPathOf(circles: Circle[], companions: Companion[], userId: string): string | null {
  const comp = companions.find((c) => c.companion.id === userId);
  if (comp) return comp.companion.avatarPath;
  for (const c of circles) {
    const m = c.userSentinels.find((s) => s.linkAsSentinel.id === userId);
    if (m) return m.linkAsSentinel.avatarPath ?? null;
  }
  return null;
}

// Their status line, as known to me: they're linked to me, or we share a
// 1st circle of someone I watch over (null = none, or not visible to me).
export function publicStatusOf(circles: Circle[], companions: Companion[], userId: string): string | null {
  const comp = companions.find((c) => c.companion.id === userId);
  if (comp?.companion.publicStatus) return comp.companion.publicStatus;
  for (const c of circles) {
    const m = c.userSentinels.find((s) => s.linkAsSentinel.id === userId);
    if (m?.linkAsSentinel.publicStatus) return m.linkAsSentinel.publicStatus;
  }
  for (const c of companions) {
    const m = c.firstCircleMembers.find((f) => f.id === userId);
    if (m?.publicStatus) return m.publicStatus;
  }
  return null;
}

// On pause, as far as it concerns me: a Sentinel of mine (or a 1st-circle
// co-member) paused for others, or a companion of mine paused for me.
export function isPausedOf(circles: Circle[], companions: Companion[], userId: string): boolean {
  if (companions.some((c) => c.companion.id === userId && c.companion.pausedForMe)) return true;
  for (const c of circles) {
    if (c.userSentinels.some((s) => s.linkAsSentinel.id === userId && s.linkAsSentinel.pausedForOthers)) return true;
  }
  return companions.some((c) => c.firstCircleMembers.some((f) => f.id === userId && f.pausedForOthers));
}
