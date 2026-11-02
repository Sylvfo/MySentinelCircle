import { useTranslation } from 'react-i18next';
import type { Membership } from '../api/sentinel';
import {
  PENDING_AVATAR_COLOR,
  PRIMARY_AVATAR_COLOR,
  PRIMARY_LEAD_COLOR,
  PRIMARY_RING_COLOR,
  circlePalette,
} from '../theme';

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="4.7" />
      <path d="M4 22 L4 15 A8 8 0 0 1 20 15 L20 22 Z" />
    </svg>
  );
}

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

// Thick colored ring + avatars around the rim — the overview tile for one
// circle. Click anywhere to expand/collapse the full member list (rendered
// by the caller, right below). Visual-only: every real action (promote to
// Lead, move, remove, invite) still lives in that existing expanded view.
export function CircleRing({
  label,
  members,
  isPrimary,
  colorIndex,
  size = 180,
  expanded,
  onToggle,
}: {
  label: string;
  members: Membership[];
  isPrimary: boolean;
  colorIndex: number;
  size?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const palette = isPrimary ? { color: PRIMARY_AVATAR_COLOR, ring: PRIMARY_RING_COLOR } : circlePalette(colorIndex);
  const RING_BORDER_WIDTH = 8;
  // Exactly the ring stroke's centerline, so an avatar's center sits right
  // on the ring, not floating inside or outside it.
  const r = size / 2 - RING_BORDER_WIDTH / 2;
  const cx = size / 2;
  const avatarSize = Math.round(size * 0.22);

  return (
    <button
      type="button"
      className={`circle-ring${expanded ? ' expanded' : ''}`}
      style={{ width: size, height: size }}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
    >
      <span className="circle-ring-border" style={{ borderColor: palette.ring }} />
      <span className="circle-ring-center">{label}</span>
      {members.map((m, i) => {
        const angle = ((-90 + (360 / members.length) * i) * Math.PI) / 180;
        const x = cx + r * Math.cos(angle) - avatarSize / 2;
        const y = cx + r * Math.sin(angle) - avatarSize / 2 - avatarSize * 0.12;
        const isLead = m.leadSlot !== null;
        const pending = m.status === 'PENDING';
        const color = pending ? PENDING_AVATAR_COLOR : isLead ? (isPrimary ? PRIMARY_LEAD_COLOR : '#D9A066') : palette.color;
        const canMessage = m.canMessageMe !== false;
        return (
          <span
            key={m.id}
            className="circle-avatar"
            style={{ left: x, top: y, width: avatarSize, height: avatarSize, color }}
          >
            <PersonIcon />
            <MessageBadge on={canMessage} />
            {isLead && <span className="circle-avatar-lead">{t('sentinel.leadSentinel')}</span>}
          </span>
        );
      })}
      <span className="circle-ring-add" aria-hidden="true">+</span>
    </button>
  );
}
