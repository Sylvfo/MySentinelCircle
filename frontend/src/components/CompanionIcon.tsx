// A companion (someone I watch over): a person inside a shield, deliberately
// different from the plain filled silhouette used for Sentinels on the rings.
// Outline only (no fill); color defaults to --companion-color, and the
// Companions page passes each person their own shade (companionColor).
// `shieldColor` overrides just the shield (gold when I'm their Lead).
export function CompanionIcon({
  size = 40,
  color,
  shieldColor,
}: {
  size?: number;
  color?: string;
  shieldColor?: string;
}) {
  return (
    <svg
      className="companion-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={color ? { color } : undefined}
      aria-hidden="true"
    >
      <path
        d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z"
        fill="none"
        stroke={shieldColor ?? 'currentColor'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.3" r="2.6" fill="currentColor" />
      <path d="M8 17.2 V15.6 A4 4 0 0 1 16 15.6 V17.2 Z" fill="currentColor" />
    </svg>
  );
}
