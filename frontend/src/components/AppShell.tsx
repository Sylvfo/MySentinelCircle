import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/circles', label: 'Cercles' },
  { to: '/companions', label: 'Companions' },
  { to: '/alerts', label: 'Alertes' },
  { to: '/messages', label: 'Messages' },
];

export function AppShell() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="brand">MySentinelCircle</div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.label}
          </NavLink>
        ))}
        <button className="logout-btn" onClick={logout}>
          Déconnexion
        </button>
      </nav>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
