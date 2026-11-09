import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { errorText } from './api/client';

// A page's data: loaded when the page opens (and again when `deps` change),
// with its loading state and the error to show. `reload` loads it again
// after a change, keeping the current data on screen meanwhile. Only the
// latest call counts, so a slow older answer can't overwrite a newer one.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const lastCall = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  });

  const fetchData = useCallback(async (showLoading: boolean) => {
    const call = ++lastCall.current;
    if (showLoading) setLoading(true);
    try {
      const value = await loadRef.current();
      if (call !== lastCall.current) return;
      setData(value);
      setError(null);
    } catch (err) {
      if (call === lastCall.current) setError(errorText(err));
    } finally {
      if (call === lastCall.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => fetchData(false), [fetchData]);
  return { data, loading, error, setError, reload };
}
