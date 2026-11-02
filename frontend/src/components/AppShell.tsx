import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import { BottomNav } from './BottomNav';
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
];

export function AppShell() {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/dashboard" className="brand">
          <img src={logo} alt="" />
          <span>MySentinelCircle</span>
        </Link>
        {user && (
          <div className="user-row">
            <NotificationBell />
            <div className="user-name">{user.firstName}</div>
          </div>
        )}
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t(item.key)}
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
