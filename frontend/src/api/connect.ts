import { apiGet, apiPost } from './client';
import type { Membership } from './sentinel';

// The QR code page (add someone): my personal code, and the person behind
// a scanned one. By phone number, the usual invite / request calls
// (api/sentinel.ts).

export interface ConnectPerson {
  id: string;
  firstName: string;
  lastName: string | null;
  avatarPath: string | null;
}

export const getMyConnectCode = () => apiGet<{ code: string }>('/sentinel/connect/mine');
export const renewConnectCode = () => apiPost<{ code: string }>('/sentinel/connect/mine/renew', {});
export const resolveConnectCode = (code: string) =>
  apiGet<ConnectPerson>(`/sentinel/connect/${encodeURIComponent(code)}`);
// "They watch over me": an invitation into one of my circles.
export const inviteByCode = (code: string, circleId: string) =>
  apiPost<Membership>(`/sentinel/connect/${encodeURIComponent(code)}/invite`, { circleId });
// "I watch over them": a request they approve.
export const requestByCode = (code: string) =>
  apiPost<Membership>(`/sentinel/connect/${encodeURIComponent(code)}/request`, {});

// What a QR code holds: a link to /connect/<code> on this site.
export const connectLink = (code: string) => `${window.location.origin}/connect/${code}`;

export function codeFromScan(text: string): string | null {
  const m = /\/connect\/([A-Za-z0-9_-]{6,32})\/?$/.exec(text.trim());
  return m ? m[1] : null;
}
