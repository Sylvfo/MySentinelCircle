// "||" badge on the avatar of someone on pause (pause for me / for others,
// see Settings). Goes with the dashed outline of SentinelIcon `paused`.
export function PauseBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`pause-badge ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
        <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
      </svg>
    </span>
  );
}
