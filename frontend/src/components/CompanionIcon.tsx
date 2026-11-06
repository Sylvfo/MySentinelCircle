// A companion (someone I watch over): the Sentinel's silhouette drawn as one
// continuous outline (head and shoulders in a single stroke, no crossing
// lines at the neck), so it reads as the counterpart of the filled Sentinel.
// Color defaults to --companion-color; the Companions page passes each person
// their own shade (companionColor). `leadColor` overrides the outline (gold
// when I'm their Lead).
export function CompanionIcon({
  size = 40,
  color,
  leadColor,
  fill = 'none',
}: {
  size?: number;
  color?: string;
  leadColor?: string;
  // Solid inside, when the outline overlaps another icon (RelationIcons).
  fill?: string;
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
        d="M4.5 22 V17 C4.5 13.5 7 11.6 9.3 11.1 A4.3 4.3 0 1 1 14.7 11.1 C17 11.6 19.5 13.5 19.5 17 V22 Z"
        fill={fill}
        stroke={leadColor ?? 'currentColor'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
