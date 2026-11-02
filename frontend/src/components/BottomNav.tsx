import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from './NotificationBell';
import logo from '../assets/logo.png';

// Mobile-only bottom icon bar (see index.css's @media max-width: 640px) —
// the desktop side nav stays as-is. Covers Settings/History/Messages/
// Notifications/Home only: Circles, Companions and Alerts are reached from
// the Dashboard's own tiles instead, per Sylvie's mobile concept.
export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav">
      <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t('nav.settings')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .69.4 1.31 1 1.51.1.04.2.07.31.09H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
