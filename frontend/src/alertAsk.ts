import type { AlertType } from './api/alert';

// The 1st circle's question depends on the kind of alert: someone missing
// is "help find them", an alert they raised themself is "take care of it",
// an assistance alert is "step in". Keys under alerts.ask.* in the locales.
export function firstCircleAskKey(alertType: AlertType | undefined): 'missing' | 'help' | 'assistance' {
  if (alertType === 'MISSING' || alertType === 'NOCONTACT' || alertType === 'UNKNOWN') return 'missing';
  if (alertType === 'INCIDENT' || alertType === 'EMERGENCY') return 'assistance';
  return 'help';
}
