import { useSyncExternalStore } from 'react';

// Day / night display. The choice (auto = follow the phone or computer,
// light, dark) is remembered in this browser only; the resolved theme is
// set as data-theme="light|dark" on <html>, which index.css keys every
// night color on.

export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let choice: ThemeChoice = readChoice();

function apply() {
  const dark = choice === 'dark' || (choice === 'auto' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

// Called once at startup (main.tsx), before the first render, so the page
// never flashes in the wrong theme.
export function initThemeMode() {
  apply();
  media?.addEventListener('change', () => {
    if (choice === 'auto') apply();
  });
}

export function setThemeChoice(next: ThemeChoice) {
  choice = next;
  try {
    if (next === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable: the choice holds until the page is reloaded.
  }
  apply();
  listeners.forEach((l) => l());
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => choice,
  );
}
