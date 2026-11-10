import { addDays, weekdayOf, zonedParts, zonedTimeToUtc } from './zoned-time';

// The All Good Check rhythm, stored as JSON in Alert.checkInSchedule:
// - DAILY: every day;
// - WEEKDAYS: on some days of the week (1 = Monday … 7 = Sunday);
// - EVERY: every N days / weeks / months, counted from a start date.
// `before` ("HH:MM"): the time of day, in the person's zone, by which they
// confirm all is well.
export type CheckInSchedule =
  | { kind: 'DAILY'; before: string }
  | { kind: 'WEEKDAYS'; days: number[]; before: string }
  | {
      kind: 'EVERY';
      every: number;
      unit: 'DAY' | 'WEEK' | 'MONTH';
      from: string; // "YYYY-MM-DD"
      before: string;
    };

type CalendarDate = { year: number; month: number; day: number };

export function parseSchedule(raw: string | null): CheckInSchedule | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CheckInSchedule;
  } catch {
    return null;
  }
}

function parseTime(hhmm: string) {
  const [hour, minute] = hhmm.split(':').map(Number);
  return { hour, minute };
}

function parseDate(yyyymmdd: string): CalendarDate {
  const [year, month, day] = yyyymmdd.split('-').map(Number);
  return { year, month, day };
}

function compareDates(a: CalendarDate, b: CalendarDate) {
  return (
    Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)
  );
}

// The day `months` after `from`, on the same day of the month — or the last
// day of a shorter month (from the 31st: 30.04, 28.02 …).
function addMonths(from: CalendarDate, months: number): CalendarDate {
  const index = from.year * 12 + (from.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(from.day, lastDay) };
}

// Does the rhythm include this calendar day?
function matchesEveryDay(schedule: CheckInSchedule, date: CalendarDate) {
  if (schedule.kind === 'DAILY') return true;
  if (schedule.kind === 'WEEKDAYS') {
    return schedule.days.includes(weekdayOf(date));
  }
  return false;
}

// The first deadline of the rhythm strictly after `after`.
export function nextCheckIn(
  schedule: CheckInSchedule,
  after: Date,
  timeZone: string,
): Date {
  const time = parseTime(schedule.before);
  const now = zonedParts(after, timeZone);
  const today: CalendarDate = {
    year: now.year,
    month: now.month,
    day: now.day,
  };

  if (schedule.kind !== 'EVERY') {
    // A week and a day always holds a match (WEEKDAYS needs >= 1 day).
    for (let i = 0; i <= 8; i++) {
      const date = addDays(today, i);
      if (!matchesEveryDay(schedule, date)) continue;
      const deadline = zonedTimeToUtc(date, time, timeZone);
      if (deadline > after) return deadline;
    }
    throw new Error('Check-in schedule without any day');
  }

  const from = parseDate(schedule.from);
  const dateAt = (k: number) =>
    schedule.unit === 'MONTH'
      ? addMonths(from, k * schedule.every)
      : addDays(from, k * schedule.every * (schedule.unit === 'WEEK' ? 7 : 1));
  // Start a little before today rather than walking from `from`.
  let k = 0;
  if (compareDates(today, from) > 0) {
    const elapsed =
      schedule.unit === 'MONTH'
        ? (today.year - from.year) * 12 + (today.month - from.month)
        : compareDates(today, from) /
          86_400_000 /
          (schedule.unit === 'WEEK' ? 7 : 1);
    k = Math.max(0, Math.floor(elapsed / schedule.every) - 1);
  }
  for (; ; k++) {
    const deadline = zonedTimeToUtc(dateAt(k), time, timeZone);
    if (deadline > after) return deadline;
  }
}
