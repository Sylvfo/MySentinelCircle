// Wall-clock time in a given IANA time zone, without a date library: Node
// ships the full ICU data, so Intl knows every zone and its DST rules.

// Used when a person never sent their browser's zone (User.timeZone null).
export const DEFAULT_TIME_ZONE = 'Europe/Zurich';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOrDefault(timeZone: string | null | undefined) {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 1 = Monday … 7 = Sunday
  hour: number;
  minute: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')) + 1,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

// How far the zone's wall clock is ahead of UTC at that instant, in ms.
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return asUtc - truncated;
}

// The instant a wall-clock time happens in that zone. A time skipped by a
// DST jump (02:30 on the spring night) lands just after the jump.
export function zonedTimeToUtc(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
  timeZone: string,
): Date {
  const wall = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
  );
  let instant = wall - offsetMs(new Date(wall), timeZone);
  // The offset at the result may differ from the one at the guess (DST).
  instant = wall - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

// A calendar date (no time, no zone) moved by whole days.
export function addDays(
  date: { year: number; month: number; day: number },
  days: number,
) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// 1 = Monday … 7 = Sunday.
export function weekdayOf(date: { year: number; month: number; day: number }) {
  const sundayFirst = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return sundayFirst === 0 ? 7 : sundayFirst;
}

// How a deadline is said (SMS, generated alert texts), in the person's own
// zone: "13:00", plus "10.11" when it isn't today.
export function deadlineParts(
  instant: Date,
  timeZone: string,
  now: Date,
): { time: string; date: string | null } {
  const p = zonedParts(instant, timeZone);
  const n = zonedParts(now, timeZone);
  const pad = (v: number) => String(v).padStart(2, '0');
  const sameDay = p.year === n.year && p.month === n.month && p.day === n.day;
  return {
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    date: sameDay ? null : `${pad(p.day)}.${pad(p.month)}`,
  };
}
