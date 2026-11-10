import { API_URL, apiGet, apiPost, readResponse } from './client';

// The test lab (/lab, dev only): backend/src/lab/. Its calls carry the lab
// token (X-Lab-Token), kept apart from the app's own sign-in.

export interface LabPhone {
  phone: string;
  name: string;
  // false: no account, SMS only.
  app: boolean;
}

export interface LabSms {
  id: string;
  createdAt: string;
  direction: 'OUT' | 'IN';
  body: string;
}

export interface LabFeedback {
  id: string;
  createdAt: string;
  testerName: string;
  scenario: string;
  tags: string;
  text: string | null;
  screenshotPath: string | null;
  readAt: string | null;
}

const LAB_TOKEN_KEY = 'msc_lab_token';

export function getLabToken(): string | null {
  try {
    return localStorage.getItem(LAB_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setLabToken(token: string | null) {
  try {
    if (token) localStorage.setItem(LAB_TOKEN_KEY, token);
    else localStorage.removeItem(LAB_TOKEN_KEY);
  } catch {
    // Private browsing: signing in again each time.
  }
}

async function lab<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Lab-Token': getLabToken() ?? '' };
  if (typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/user/lab${path}`, { ...init, headers });
  return readResponse<T>(res);
}
const post = <T>(path: string, data: unknown) => lab<T>(path, { method: 'POST', body: JSON.stringify(data) });

export const labLogin = (identifier: string, password: string) =>
  lab<{ labToken: string; testerName: string; phones: LabPhone[] }>('/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
export const labMe = () => lab<{ testerName: string; phones: LabPhone[] }>('/me');
export const labLoginAs = (phone: string) => post<{ accessToken: string }>('/login-as', { phone });
export const labSmsAll = () => lab<Record<string, LabSms[]>>('/sms/all');
export const labReply = (phone: string, body: string) => post<unknown>('/sms', { phone, body });
export const labAdvance = (hours: number) => post<{ offsetHours: number }>('/advance', { hours });
export const labReset = () => post<{ closed: number }>('/reset', {});

export function sendLabFeedback(data: { scenario: string; tags: string[]; text: string; screenshot: Blob | null }) {
  const form = new FormData();
  form.append('scenario', data.scenario);
  form.append('tags', data.tags.join(','));
  if (data.text.trim()) form.append('text', data.text.trim());
  if (data.screenshot) form.append('screenshot', data.screenshot, 'capture.jpg');
  return lab<LabFeedback>('/feedback', { method: 'POST', body: form });
}

// Admin page (the app's own admin sign-in).
export const listLabFeedback = () => apiGet<LabFeedback[]>('/user/lab/admin/feedback');
export const markLabFeedbackRead = (id: string) => apiPost<LabFeedback>(`/user/lab/admin/feedback/${id}/read`, {});
