import type { TFunction } from 'i18next';
import type { Checkpoint, TripStepInput, Watch } from '../../api/watch';
import { currentCheckpoint, minutesBetween } from '../../api/watch';

const DAY_MS = 86_400_000;

// "13:00" today, "samedi 13:00" this week, "12 déc. 13:00" further away.
export function formatWhen(iso: string, lang: string): string {
  const at = new Date(iso);
  const now = new Date();
  const time = at.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  if (Math.abs(at.getTime() - now.getTime()) < 6 * DAY_MS) {
    return `${at.toLocaleDateString(lang, { weekday: 'long' })} ${time}`;
  }
  return `${at.toLocaleDateString(lang, { day: 'numeric', month: 'short' })} ${time}`;
}

// "30 minutes", "2 heures", "1 jour", "1 semaine".
export function formatDelay(minutes: number, t: TFunction): string {
  if (minutes % 10080 === 0) return t('watch.delay.weeks', { count: minutes / 10080 });
  if (minutes % 1440 === 0) return t('watch.delay.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('watch.delay.hours', { count: minutes / 60 });
  return t('watch.delay.minutes', { count: minutes });
}

// The delay a deadline carries (alertAt - expectedAt).
export const delayOf = (c: Checkpoint) => minutesBetween(c.expectedAt, c.alertAt);

// A trip's delay is the whole trip's: its latest step's.
export function tripDelay(watch: Watch): number {
  const last = watch.checkpoints.at(-1);
  return last ? delayOf(last) : 120;
}

// A day ("2026-11-15") and a time ("13:00") from separate inputs, in the
// browser's own time; and back from an ISO instant.
export function dayAndTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
export const toIso = (day: string, time: string) => new Date(`${day}T${time}`).toISOString();

// "samedi 15 novembre à 13:00": what the person chose, said plainly.
export function sayDayAndTime(day: string, time: string, lang: string): string | null {
  if (!day || !time) return null;
  const at = new Date(`${day}T${time}`);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(lang, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// A point from a pasted map link (Google Maps, Apple Plans, OpenStreetMap),
// or typed "46.5, 6.6".
export function coordsFromLink(text: string): { latitude: number; longitude: number } | null {
  const patterns = [
    /mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|sll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
  }
  return null;
}

// When the 1st circle is told (as the backend counts it): at alertAt, but
// never sooner than a full delay after a late reminder.
export function effectiveAlertAt(c: Checkpoint): string {
  if (!c.remindedAt) return c.alertAt;
  const delay = new Date(c.alertAt).getTime() - new Date(c.expectedAt).getTime();
  const after = new Date(c.remindedAt).getTime() + delay;
  return new Date(Math.max(new Date(c.alertAt).getTime(), after)).toISOString();
}

// The dashboard tile: the deadline to validate, short — a label, then the
// place and its time on one line. Past its time it turns red (`late`) and
// says when the alert goes off.
export function watchToDo(
  watch: Watch,
  t: TFunction,
  lang: string,
): { label: string; detail: string | null; then: string | null; late: boolean } {
  if (watch.pausedBecause) {
    return { label: t(`watch.paused.${watch.pausedBecause}`), detail: null, then: null, late: false };
  }
  const current = currentCheckpoint(watch);
  if (!current) return { label: t('watch.todo.planNext'), detail: null, then: null, late: false };
  const due = formatWhen(current.expectedAt, lang);
  const isTrip = watch.mode === 'TRIP';
  const detail = isTrip ? `${current.placeName ?? ''} · ${due}` : t('watch.todo.before', { due });
  if (current.missedAt) {
    return { label: t('watch.todo.alertSent'), detail, then: t('watch.todo.sayAllGood'), late: true };
  }
  if (new Date(current.expectedAt) <= new Date()) {
    return {
      label: t('watch.todo.late'),
      detail,
      then: t('watch.todo.alertAt', { at: formatWhen(effectiveAlertAt(current), lang) }),
      late: true,
    };
  }
  return { label: isTrip ? t('watch.todo.nextStep') : t('watch.todo.nextCheck'), detail, then: null, late: false };
}

// A step being written: what the form holds before it is sent.
export interface StepDraft {
  placeName: string;
  // <input type="date"> / <input type="time">, in the browser's time.
  day: string;
  time: string;
  delayMinutes: number;
  latitude?: number;
  longitude?: number;
}

export const emptyStep = (delayMinutes = 120): StepDraft => ({
  placeName: '',
  day: dayAndTime(new Date().toISOString()).day,
  time: '',
  delayMinutes,
});

export const stepReady = (s: StepDraft) => s.placeName.trim() !== '' && s.day !== '' && s.time !== '';

export function stepInput(s: StepDraft): TripStepInput {
  return {
    placeName: s.placeName.trim(),
    expectedAt: toIso(s.day, s.time),
    delayMinutes: s.delayMinutes,
    ...(s.latitude !== undefined && s.longitude !== undefined ? { latitude: s.latitude, longitude: s.longitude } : {}),
  };
}
