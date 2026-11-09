import { useState } from 'react';
import { errorText } from './api/client';

// One thing the user does that calls the server (a button, a form): busy
// while it runs, its error kept to show if it fails. `run` resolves to true
// when it worked, so the caller can go on only then.
// - fallback: the text shown for an unexpected error (not from the server),
//   for every run or for one run;
// - onError: hand the error to the parent instead of keeping it here.
export function useAction(options: { fallback?: string; onError?: (message: string) => void } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, fallback = options.fallback): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      const message = errorText(err, fallback);
      if (options.onError) options.onError(message);
      else setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, run };
}
