export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// Test lab (/lab): each phone is a frame named "lab-…" with its own
// sign-in, so four people can be signed in side by side.
const LAB_FRAME = typeof window !== 'undefined' && window.name.startsWith('lab-') ? window.name : null;
const TOKEN_KEY = LAB_FRAME ? `msc_token:${LAB_FRAME}` : 'msc_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  forgetSharedGets();
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  forgetSharedGets();
  localStorage.removeItem(TOKEN_KEY);
}

// A short memory of the few lists almost every page loads (my circles, the
// people I watch over, my alerts): pages opened within a few seconds of each
// other share one request instead of each asking again (the API has a
// per-minute rate limit). Forgotten on every change I make (any call that
// isn't a GET), on every live event from the server (realtime/socket.ts),
// and on login/logout, so a page never shows data older than that.
const SHARED_GET_TTL_MS = 30_000;
const sharedGets = new Map<string, { at: number; promise: Promise<unknown> }>();

export function forgetSharedGets(): void {
  sharedGets.clear();
}

export function apiGetShared<T>(path: string): Promise<T> {
  let entry = sharedGets.get(path);
  if (!entry || Date.now() - entry.at >= SHARED_GET_TTL_MS) {
    const promise = apiGet<T>(path);
    entry = { at: Date.now(), promise };
    sharedGets.set(path, entry);
    // A failed call isn't kept: the next page asks again.
    promise.catch(() => {
      if (sharedGets.get(path)?.promise === promise) sharedGets.delete(path);
    });
  }
  // Each caller gets its own copy: a page sorting or editing its list can't
  // change another page's.
  return entry.promise.then((data) => structuredClone(data) as T);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// What to show the user for a failed call: the server's own message, else
// the fallback (or the raw error, for an unexpected one).
export function errorText(err: unknown, fallback?: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback ?? String(err);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).finally(() => {
    // Once the change is done (or failed), the next list load asks again.
    if (options.method !== 'GET') forgetSharedGets();
  });
  return readResponse<T>(res);
}

// The server's answer: its JSON body, or an ApiError carrying its message.
export async function readResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;

  let body: any;
  let parseFailed = false;
  try {
    body = await res.json();
  } catch {
    parseFailed = true;
  }

  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }
  // A 2xx response that isn't valid JSON means the request never actually
  // reached the backend (e.g. a missing nginx route silently falling
  // through to the frontend's own index.html) — surfacing it as null here
  // would let every caller silently misbehave instead of erroring loudly.
  if (parseFailed) {
    throw new ApiError(res.status, 'Unexpected non-JSON response');
  }

  return body as T;
}

export function apiPost<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(data) });
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// No JSON Content-Type here — the browser sets the correct
// multipart/form-data boundary itself when the body is a FormData.
export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).finally(forgetSharedGets);
  return readResponse<T>(res);
}
