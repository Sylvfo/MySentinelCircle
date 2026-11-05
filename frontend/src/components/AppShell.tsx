import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { alertNeedsMe, listAlerts } from '../api/alert';
import { NotificationBell } from './NotificationBell';
import { BottomNav } from './BottomNav';
import { useUnreadCounts, useUnreadCountsRefresher } from '../unreadCounts';
import { UserMenu } from './UserMenu';
import logo from '../assets/logo.png';

// No separate "Dashboard" link — the logo itself always goes there (see
// .brand below), so a second link to the same place would be redundant.
const NAV_ITEMS = [
  { to: '/circles', key: 'nav.circles' },
  { to: '/companions', key: 'nav.companions' },
  { to: '/alerts', key: 'nav.alerts' },
  { to: '/history', key: 'nav.history' },
  { to: '/messages', key: 'nav.messages' },
  { to: '/settings', key: 'nav.settings' },
  { to: '/info', key: 'nav.info' },
];

export function AppShell() {
  const { user, socket } = useAuth();
  const { t } = useTranslation();
  // One refresher for every unread badge (bell, Messages tabs).
  useUnreadCountsRefresher();
  const { messages: unreadMessages } = useUnreadCounts();
  const { pathname } = useLocation();
  const [alertMode, setAlertMode] = useState(false);

  // Red background on every page while an alert needs this viewer. Rechecked
  // on navigation and on every live alert change; a failed check just keeps
  // the last known mode.
  useEffect(() => {
    if (!user) return;
    const check = () => {
      listAlerts()
        .then((alerts) => setAlertMode(alerts.some((a) => alertNeedsMe(a, user.id))))
        .catch(() => {});
    };
    check();
    socket?.on('alert:changed', check);
    return () => {
      socket?.off('alert:changed', check);
    };
  }, [user, socket, pathname]);

  return (
    <div className={`app-shell${alertMode ? ' alert-mode' : ''}`}>
      <nav className="app-nav">
        <Link to="/dashboard" className="brand">
          <img src={logo} alt="" />
          <span className="brand-text">
            <span>MySentinelCircle</span>
            <span className="brand-slogan">{t('nav.slogan')}</span>
          </span>
        </Link>
        {user && (
          <div className="user-row">
            <NotificationBell />
            <UserMenu />
          </div>
        )}
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t(item.key)}
              {item.to === '/messages' && unreadMessages > 0 && (
                <span className="notification-count inline messages">{unreadMessages}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="app-content">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
