import { useAvatarUrl } from '../avatars';
import { RelationIcons } from './RelationIcons';
import { PauseBadge } from './PauseBadge';

// A person as shown in lists and headers. With a profile photo: the round
// photo, with the relation icon(s) as a small badge in the corner. Without:
// just the relation icon(s), as before photos existed.
export function PersonAvatar({
  userId,
  avatarPath,
  sentinelColor,
  companionColor,
  size = 36,
  photoRing,
  paused,
}: {
  userId: string;
  avatarPath: string | null | undefined;
  sentinelColor: string | null;
  companionColor: string | null;
  size?: number;
  // Photo only, ringed in this color, no relation badge — for places that
  // already show the relations next to it (the conversation header).
  photoRing?: string;
  // On pause (see Settings): dashed outline and a "||" badge.
  paused?: boolean;
}) {
  const url = useAvatarUrl(userId, avatarPath);

  if (!url)
    return <RelationIcons sentinelColor={sentinelColor} companionColor={companionColor} size={size} paused={paused} />;

  // Ring around the photo in the strongest relation color (as on the badge).
  const ringColor = photoRing ?? sentinelColor ?? companionColor ?? 'var(--border)';
  return (
    <span className={`person-avatar${paused ? ' is-paused' : ''}`} style={{ width: size, height: size }}>
      <img src={url} alt="" className="person-avatar-photo" style={{ borderColor: ringColor }} />
      {paused && <PauseBadge />}
      {!photoRing && (
        <span className="person-avatar-badge">
          <RelationIcons
            sentinelColor={sentinelColor}
            companionColor={companionColor}
            size={Math.max(28, Math.round(size * 0.76))}
          />
        </span>
      )}
    </span>
  );
}
