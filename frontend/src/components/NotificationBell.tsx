import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { getUnreadCount, listNotifications, markNotificationRead, type NotificationItem } from '../api/notification';

// Maps a notification to the page that already shows the entity it's
// about — there's no per-entity route (e.g. no /alerts/:id) to deep-link
// into, so this lands on the right page, not the right row.
function destinationFor(item: NotificationItem): string {
  if (item.type.startsWith('ALERT_')) return '/alerts';
  if (item.type === 'NEW_MESSAGE') return '/messages';
  return '/companions';
}

// SENTINEL_LINK_ANSWERED carries its outcome in `accepted`, not in a
// separate type — split it into two translation keys here so the i18n
// file can stay flat.
function translationKey(item: NotificationItem): string {
  if (item.type === 'SENTINEL_LINK_ANSWERED') {
    return item.accepted ? 'SENTINEL_LINK_ACCEPTED' : 'SENTINEL_LINK_DECLINED';
  }
  return item.type;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { socket } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const reloadCount = () => {
    getUnreadCount()
      .then(({ count }) => setUnreadCount(count))
      .catch(() => {});
  };

  useEffect(() => {
    reloadCount();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', reloadCount);
    return () => {
      socket.off('notification:new', reloadCount);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

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
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // navigation still proceeds even if marking it read failed
      }
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
                className={`notification-item${item.readAt ? '' : ' unread'}`}
                onClick={() => handleItemClick(item)}
              >
                {t(`notifications.types.${translationKey(item)}`, { who: item.actorLabel ?? '' })}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
