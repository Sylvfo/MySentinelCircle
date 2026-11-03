import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from './NotificationBell';
import logo from '../assets/logo.png';

// Mobile-only bottom icon bar (see index.css's @media max-width: 640px) —
// the desktop side nav stays as-is. Covers Info/History/Messages/
// Notifications/Home only: Circles, Companions and Alerts are reached from
// the Dashboard's own tiles instead, per Sylvie's mobile concept, and
// Settings from the menu under your name (UserMenu).
export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav">
      <NavLink to="/info" className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t('nav.info')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="11" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t('nav.history')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </NavLink>
      <NavLink to="/messages" className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t('nav.messages')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </NavLink>
      <NotificationBell />
      <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t('nav.dashboard')}>
        <img src={logo} alt="" width={22} height={22} />
      </NavLink>
    </nav>
  );
}
