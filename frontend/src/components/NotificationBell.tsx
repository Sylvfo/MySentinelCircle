import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNotifications, markNotificationRead, type NotificationItem } from '../api/notification';
import { decrementUnreadCount, useUnreadCounts } from '../unreadCounts';
import { genderContext } from '../gender';

// Maps a notification to the page that already shows the entity it's
// about. A new message opens its conversation (with the sender); other
// types have no per-entity route, so they land on the right page.
// Where a notification leads: the alert itself, or the page of the person
// it's about whenever we're still linked; else the list where it's handled.
// targetId = the alert. A resolved one is redirected to History anyway.
function alertDestination(item: NotificationItem): string {
  if (!item.targetId) return '/running-alert';
  return item.type === 'ALERT_CLOSED' ? `/history/${item.targetId}` : `/running-alert/${item.targetId}`;
}

function destinationFor(item: NotificationItem): string {
  const actor = item.actorUserId;
  if (item.type.startsWith('ALERT_')) return alertDestination(item);
  if (item.type === 'NEW_MESSAGE') return actor ? `/messages/${actor}` : '/messages';
  // Someone asks to watch over me: approved from My Circles' inbox.
  if (item.type === 'SENTINEL_REQUEST_RECEIVED') return '/circles';
  if (item.type === 'SENTINEL_GROUP_INVITED' || item.type === 'SENTINEL_LEFT') return '/circles';
  // Accepted: we're now linked, their page shows it. Declined: no page.
  if (item.type === 'SENTINEL_LINK_ANSWERED' && item.accepted && actor) return `/people/${actor}`;
  // My companion asks me to move into their 1st circle.
  if (item.type === 'CIRCLE_MOVE_PROPOSED' && actor) return `/people/${actor}?from=companion`;
  // My Sentinel went to my reserve: their page, where I can move them back.
  if (item.type === 'SENTINEL_TO_RESERVE' && actor) return `/people/${actor}?from=sentinel`;
  // My Sentinel answered my move proposal.
  if (item.type === 'CIRCLE_MOVE_ANSWERED' && actor) return `/people/${actor}?from=sentinel`;
  // targetId = the companion the death notice is about: report / confirm /
  // reject and the announcement live on their page.
  if (item.type.startsWith('DEATH_NOTICE_') && item.targetId) return `/people/${item.targetId}?from=companion`;
  // Invitations received (SENTINEL_INVITATION_RECEIVED) are answered there.
  return '/companions';
}

// SENTINEL_LINK_ANSWERED and CIRCLE_MOVE_ANSWERED carry their outcome in
// `accepted`, not in a separate type — split it into two translation keys here so the i18n
// file can stay flat.
function translationKey(item: NotificationItem): string {
  if (item.type === 'SENTINEL_LINK_ANSWERED') {
    return item.accepted ? 'SENTINEL_LINK_ACCEPTED' : 'SENTINEL_LINK_DECLINED';
  }
  if (item.type === 'CIRCLE_MOVE_ANSWERED') {
    return item.accepted ? 'CIRCLE_MOVE_ACCEPTED' : 'CIRCLE_MOVE_DECLINED';
  }
  return item.type;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  // Shared with the Messages tab badges (refreshed by AppShell); the bell's
  // own count leaves new messages out — they live on the Messages tab.
  const { count: unreadCount } = useUnreadCounts();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      listNotifications()
        .then(setItems)
        .catch(() => setItems([]));
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    setOpen(false);
    setItems((list) => list.filter((i) => i.id !== item.id));
    // New messages never reach the bell (filtered server-side), so every
    // item here is marked read on click.
    try {
      await markNotificationRead(item.id);
      decrementUnreadCount();
    } catch {
      // navigation still proceeds even if marking it read failed
    }
    navigate(destinationFor(item));
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button type="button" className="bell-btn" onClick={toggleOpen} aria-label={t('notifications.title')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          {items.length === 0 ? (
            <div className="notification-empty">{t('notifications.empty')}</div>
          ) : (
            items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="notification-item unread"
                onClick={() => handleItemClick(item)}
              >
                {t(`notifications.types.${translationKey(item)}`, {
                  who: item.actorLabel ?? '',
                  context: genderContext(item.actorGender),
                })}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
