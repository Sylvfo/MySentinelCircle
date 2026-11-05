// A Sentinel (someone watching over me): plain filled silhouette, the same
// one used for avatars on the circle rings. Sized by CSS unless `size` is set.
export function SentinelIcon({ size }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="4.7" />
      <path d="M4 22 L4 15 A8 8 0 0 1 20 15 L20 22 Z" />
    </svg>
  );
}
