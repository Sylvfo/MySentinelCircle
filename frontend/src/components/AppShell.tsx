import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';

const NAV_ITEMS = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/circles', key: 'nav.circles' },
  { to: '/companions', key: 'nav.companions' },
  { to: '/alerts', key: 'nav.alerts' },
  { to: '/messages', key: 'nav.messages' },
];

export function AppShell() {
  const { logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="brand">MySentinelCircle</div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {t(item.key)}
          </NavLink>
        ))}
        <LanguageSwitcher />
        <button className="logout-btn" onClick={logout}>
          {t('nav.logout')}
        </button>
      </nav>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
