import { useState } from 'react';
import type { AlertLocation } from './api/alert';

// Beyond this the position is a rough guess (a computer without GPS
// locates by its internet connection): shown with a warning, never refused.
export const APPROXIMATE_ACCURACY_M = 1000;

// "15 m" / "1.5 km" / "12 km".
export function formatAccuracy(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export type LocateError = 'denied' | 'failed' | 'unsupported';

// Asks the phone for its position, once per call of locate().
export function useLocate() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateError | null>(null);

  const locate = () =>
    new Promise<AlertLocation | null>((resolve) => {
      if (!navigator.geolocation) {
        setError('unsupported');
        resolve(null);
        return;
      }
      setLocating(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          setLocating(false);
          setError(err.code === err.PERMISSION_DENIED ? 'denied' : 'failed');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  return { locate, locating, error };
}
