export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'msc_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  });

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
  });

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
  if (parseFailed) {
    throw new ApiError(res.status, 'Unexpected non-JSON response');
  }

  return body as T;
}
