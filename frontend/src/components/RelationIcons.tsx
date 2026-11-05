import { SentinelIcon } from './SentinelIcon';
import { CompanionIcon } from './CompanionIcon';

// Who someone is to me, without words: the filled Sentinel silhouette (they
// watch over me), the companion outline (I watch over them), or both side by
// side, overlapping, each in its own color (see relations.ts).
export function RelationIcons({
  sentinelColor,
  companionColor,
  size = 36,
}: {
  sentinelColor: string | null;
  companionColor: string | null;
  size?: number;
}) {
  const both = sentinelColor && companionColor;
  return (
    <span
      className={`relation-icons${both ? ' both' : ''}`}
      style={{ width: both ? Math.round(size * 1.45) : size, height: size }}
      aria-hidden="true"
    >
      {sentinelColor && (
        <span className="relation-sentinel" style={{ color: sentinelColor, width: size, height: size }}>
          <SentinelIcon size={Math.round(size * 0.82)} />
        </span>
      )}
      {companionColor && <CompanionIcon size={size} color={companionColor} fill={both ? 'var(--bg)' : 'none'} />}
    </span>
  );
}
