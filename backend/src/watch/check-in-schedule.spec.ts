import { nextCheckIn } from './check-in-schedule';
import {
  deadlineParts,
  isValidTimeZone,
  zonedParts,
  zonedTimeToUtc,
} from './zoned-time';

const ZURICH = 'Europe/Zurich';

describe('zoned time', () => {
  it('turns a Zurich wall-clock time into UTC, winter and summer', () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 1, day: 15 },
        { hour: 20, minute: 0 },
        ZURICH,
      ).toISOString(),
    ).toBe('2026-01-15T19:00:00.000Z');
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 7, day: 15 },
        { hour: 20, minute: 0 },
        ZURICH,
      ).toISOString(),
    ).toBe('2026-07-15T18:00:00.000Z');
  });

  it('lands a time skipped by the spring DST jump just after it', () => {
    // 29.03.2026: 02:00 -> 03:00 in Zurich.
    const t = zonedTimeToUtc(
      { year: 2026, month: 3, day: 29 },
      { hour: 2, minute: 30 },
      ZURICH,
    );
    expect(zonedParts(t, ZURICH)).toMatchObject({ hour: 3, minute: 30 });
  });

  it('reads the weekday in the zone, not in UTC', () => {
    // Sunday 23:30 UTC is already Monday in Tokyo.
    const instant = new Date('2026-11-08T23:30:00Z');
    expect(zonedParts(instant, 'UTC').weekday).toBe(7);
    expect(zonedParts(instant, 'Asia/Tokyo').weekday).toBe(1);
  });

  it('tells a real zone from a made-up one', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('says the date only when the deadline is not today', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    expect(
      deadlineParts(new Date('2026-11-10T12:00:00Z'), ZURICH, now),
    ).toEqual({ time: '13:00', date: null });
    expect(
      deadlineParts(new Date('2026-11-11T12:00:00Z'), ZURICH, now),
    ).toEqual({ time: '13:00', date: '11.11' });
  });
});

describe('nextCheckIn', () => {
  it('DAILY: today when before the time, else tomorrow', () => {
    const schedule = { kind: 'DAILY' as const, before: '20:00' };
    expect(
      nextCheckIn(schedule, new Date('2026-11-10T10:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-11-10T19:00:00Z'));
    expect(
      nextCheckIn(schedule, new Date('2026-11-10T19:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-11-11T19:00:00Z'));
  });

  it('DAILY: keeps the local time across the autumn DST change', () => {
    // 25.10.2026: 03:00 -> 02:00 in Zurich.
    const next = nextCheckIn(
      { kind: 'DAILY', before: '09:00' },
      new Date('2026-10-24T08:00:00Z'),
      ZURICH,
    );
    expect(next).toEqual(new Date('2026-10-25T08:00:00Z'));
    expect(zonedParts(next, ZURICH).hour).toBe(9);
  });

  it('WEEKDAYS: the next chosen day of the week', () => {
    // Tuesday 10.11.2026, after 20:00 -> Thursday (4) 12.11.
    expect(
      nextCheckIn(
        { kind: 'WEEKDAYS', days: [1, 4], before: '20:00' },
        new Date('2026-11-10T20:00:00Z'),
        ZURICH,
      ),
    ).toEqual(new Date('2026-11-12T19:00:00Z'));
  });

  it('EVERY N days from a start date', () => {
    const schedule = {
      kind: 'EVERY' as const,
      every: 3,
      unit: 'DAY' as const,
      from: '2026-11-01',
      before: '12:00',
    };
    // 01, 04, 07, 10, 13 …
    expect(
      nextCheckIn(schedule, new Date('2026-11-10T12:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-11-13T11:00:00Z'));
    expect(
      nextCheckIn(schedule, new Date('2026-11-10T08:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-11-10T11:00:00Z'));
  });

  it('EVERY N weeks, and a start date still to come', () => {
    expect(
      nextCheckIn(
        {
          kind: 'EVERY',
          every: 2,
          unit: 'WEEK',
          from: '2026-12-01',
          before: '12:00',
        },
        new Date('2026-11-10T08:00:00Z'),
        ZURICH,
      ),
    ).toEqual(new Date('2026-12-01T11:00:00Z'));
  });

  it('EVERY month from the 31st: the last day of shorter months', () => {
    const schedule = {
      kind: 'EVERY' as const,
      every: 1,
      unit: 'MONTH' as const,
      from: '2026-01-31',
      before: '12:00',
    };
    expect(
      nextCheckIn(schedule, new Date('2026-02-01T00:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-02-28T11:00:00Z'));
    expect(
      nextCheckIn(schedule, new Date('2026-11-10T00:00:00Z'), ZURICH),
    ).toEqual(new Date('2026-11-30T11:00:00Z'));
  });
});
