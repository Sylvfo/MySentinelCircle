import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import { BottomNav } from './BottomNav';
import { useUnreadCounts, useUnreadCountsRefresher } from '../unreadCounts';
import { UserMenu } from './UserMenu';
import { AlertSignal } from './AlertSignal';
import logo from '../assets/logo.png';
import { useLanguageSync } from '../languageSync';
import { takeAfterLogin } from '../auth/afterLogin';

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
  const { user } = useAuth();
  const { t } = useTranslation();
  // One refresher for every unread badge (bell, Messages tabs).
  useUnreadCountsRefresher();
  // My SMS follow the app's language.
  useLanguageSync();
  const navigate = useNavigate();
  // Signed in from a scanned QR link: back to it.
  useEffect(() => {
    const path = takeAfterLogin();
    if (path) navigate(path, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { messages: unreadMessages, support: unreadSupport } = useUnreadCounts();
  return (
    <div className="app-shell">
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
            <AlertSignal />
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
              {item.to === '/info' && unreadSupport > 0 && (
                <span className="notification-count inline">{unreadSupport}</span>
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
