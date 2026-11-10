// A page asked for before signing in (a scanned QR link), reopened after.
const AFTER_LOGIN_KEY = 'msc_after_login';

export function rememberAfterLogin(path: string) {
  try {
    sessionStorage.setItem(AFTER_LOGIN_KEY, path);
  } catch {
    // Private browsing: they just land on the dashboard.
  }
}

export function takeAfterLogin(): string | null {
  try {
    const path = sessionStorage.getItem(AFTER_LOGIN_KEY);
    sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return path;
  } catch {
    return null;
  }
}
