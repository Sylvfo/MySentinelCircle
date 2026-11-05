import { useTranslation } from 'react-i18next';
import type { Membership } from '../api/sentinel';
import {
  IN_ALERT_AVATAR_COLOR,
  PENDING_AVATAR_COLOR,
  PRIMARY_AVATAR_COLOR,
  PRIMARY_LEAD_COLOR,
  PRIMARY_RING_COLOR,
  circlePalette,
} from '../theme';
import { SentinelIcon } from './SentinelIcon';
import { useAvatarUrl } from '../avatars';

function MessageBadge({ on }: { on: boolean }) {
  return (
    <span className={`circle-msg-badge ${on ? 'on' : 'off'}`} aria-hidden="true">
      {on ? (
        <svg viewBox="0 0 24 24">
          <path d="M7 2 L10 8 L4 8 Z" fill="#1a7f37" />
          <rect x="2" y="7" width="20" height="14" rx="6" fill="#1a7f37" />
          <polyline points="7 14 10.5 17.5 17 10" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M7 2 L10 8 L4 8 Z" fill="#b3261e" />
          <rect x="2" y="7" width="20" height="14" rx="6" fill="#b3261e" />
          <line x1="7.5" y1="10.5" x2="16.5" y2="17.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="16.5" y1="10.5" x2="7.5" y2="17.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

// One avatar's face: their profile photo (ring in the avatar's color, small
// Sentinel badge) when `withPhoto` and they have one — same principle as
// PersonAvatar on the Companions page — otherwise the plain silhouette.
function AvatarFace({
  userId,
  avatarPath,
  color,
  withPhoto,
}: {
  userId: string;
  avatarPath: string | null | undefined;
  color: string;
  withPhoto: boolean;
}) {
  const url = useAvatarUrl(userId, withPhoto ? avatarPath : null);
  if (!url) return <SentinelIcon />;
  return (
    <>
      <img src={url} alt="" className="circle-avatar-photo" style={{ borderColor: color }} />
      <span className="circle-avatar-sentinel-badge" style={{ color }} aria-hidden="true">
        <SentinelIcon />
      </span>
    </>
  );
}

// Thick colored ring + avatars around the rim. With `onOpen` it's a button
// (My Circles overview: click to open the circle's detail); without, a plain
// picture (the detail view's big ring). Visual-only: every real action
// (promote to Lead, move, remove, invite) lives in the detail's CircleCard.
export function CircleRing({
  label,
  members,
  isPrimary,
  colorIndex,
  size = 180,
  onOpen,
  showNames,
  onSelectMember,
  selectedMemberId,
  inAlertUserIds,
  isGroup,
  strongRing,
  showPhotos,
}: {
  label: string;
  members: Membership[];
  isPrimary: boolean;
  colorIndex: number;
  size?: number;
  onOpen?: () => void;
  // Detail view: each Sentinel's first name under their avatar.
  showNames?: boolean;
  // Detail view: avatars become buttons opening that Sentinel's actions.
  onSelectMember?: (m: Membership) => void;
  selectedMemberId?: string | null;
  // Sentinels currently the subject of an alert: their avatar turns red.
  inAlertUserIds?: Set<string>;
  // Group circles get a second, inner line, to tell them apart at a glance.
  isGroup?: boolean;
  // Light backgrounds (Dashboard's satin tiles): the pale ring tint would
  // vanish, so draw the ring in a see-through shade of the avatars' color.
  strongRing?: boolean;
  // A circle's own page: show profile photos instead of silhouettes.
  showPhotos?: boolean;
}) {
  const { t } = useTranslation();
  const palette = isPrimary ? { color: PRIMARY_AVATAR_COLOR, ring: PRIMARY_RING_COLOR } : circlePalette(colorIndex);
  const ringColor = strongRing ? `color-mix(in srgb, ${palette.color} 40%, transparent)` : palette.ring;
  const RING_BORDER_WIDTH = 5;
  // Exactly the ring stroke's centerline, so an avatar's center sits right
  // on the ring, not floating inside or outside it.
  const r = size / 2 - RING_BORDER_WIDTH / 2;
  const cx = size / 2;
  const avatarSize = Math.round(size * 0.22);

  const Root = onOpen ? 'button' : 'div';

  return (
    <Root
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className="circle-ring"
      style={{ width: size, height: size }}
      aria-label={label}
    >
      <span className="circle-ring-border" style={{ borderColor: ringColor }} />
      {isGroup && <span className="circle-ring-border inner" style={{ borderColor: ringColor }} />}
      <span className={`circle-ring-center${isGroup ? ' group' : ''}`}>{label}</span>
      {members.map((m, i) => {
        const angle = ((-90 + (360 / members.length) * i) * Math.PI) / 180;
        const x = cx + r * Math.cos(angle) - avatarSize / 2;
        const y = cx + r * Math.sin(angle) - avatarSize / 2 - avatarSize * 0.12;
        const isLead = m.leadSlot !== null;
        const pending = m.status === 'PENDING';
        const inAlert = inAlertUserIds?.has(m.linkAsSentinel.id) ?? false;
        const color = inAlert
          ? IN_ALERT_AVATAR_COLOR
          : pending
            ? PENDING_AVATAR_COLOR
            : isLead
              ? isPrimary
                ? PRIMARY_LEAD_COLOR
                : '#D9A066'
              : palette.color;
        // Can chat in the app (has an account) — a Sentinel SMS can't.
        const canMessage = m.sentinelType !== 'ONLY_SMS';
        const Avatar = onSelectMember ? 'button' : 'span';
        return (
          <Avatar
            key={m.id}
            {...(onSelectMember
              ? { type: 'button' as const, onClick: () => onSelectMember(m), 'aria-label': m.linkAsSentinel.firstName }
              : {})}
            className={`circle-avatar${selectedMemberId === m.id ? ' selected' : ''}`}
            style={{ left: x, top: y, width: avatarSize, height: avatarSize, color }}
          >
            <AvatarFace
              userId={m.linkAsSentinel.id}
              avatarPath={m.linkAsSentinel.avatarPath}
              color={color}
              withPhoto={!!showPhotos}
            />
            <MessageBadge on={canMessage} />
            {showNames ? (
              <span className="circle-avatar-caption">
                <span className="circle-avatar-name">{m.linkAsSentinel.firstName}</span>
                {isLead && <span className="circle-avatar-lead-tag">{t('sentinel.leadSentinel')}</span>}
              </span>
            ) : (
              isLead && <span className="circle-avatar-lead">{t('sentinel.leadSentinel')}</span>
            )}
          </Avatar>
        );
      })}
    </Root>
  );
}
