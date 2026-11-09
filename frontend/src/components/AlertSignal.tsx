import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { alertNeedsMe, listAlerts, type MyAlertSummary } from '../api/alert';

// Warning triangle in the top bar, between the app's name and mine, on
// every page:
// - big, red, gently pulsing: an alert is waiting for my answer (I was
//   asked and haven't replied, or someone raised one about me and I
//   haven't said how I am yet);
// - small, orange: an alert concerning me is still running.
// Nothing otherwise. A tap opens the alert (or the list, if several).
export function AlertSignal() {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const location = useLocation();
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);

  const reload = () => {
    listAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]));
  };

  // On each page change (answering happens on another page) and live, on
  // every change pushed for an alert of mine.
  useEffect(reload, [location.pathname]);
  useEffect(() => {
    if (!socket) return;
    socket.on('alert:changed', reload);
    return () => {
      socket.off('alert:changed', reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const running = alerts.filter((a) => alertNeedsMe(a, user?.id));
  const waiting = running.filter(
    (a) =>
      a.myParticipation?.status === 'CONTACTED' ||
      // About me, raised by someone else, and I haven't said how I am.
      (a.userCompanionId === user?.id && a.launchedById !== user?.id && !a.statusByCompanion),
  );
  if (running.length === 0) return null;

  const urgent = waiting.length > 0;
  const shown = urgent ? waiting : running;
  const to = shown.length === 1 ? `/running-alert/${shown[0].id}` : '/running-alert';
  const label = t(urgent ? 'alertSignal.waiting' : 'alertSignal.running', { count: shown.length });

  return (
    <Link to={to} className={`alert-signal ${urgent ? 'urgent' : 'running'}`} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="tri" d="M12 2.5 22.5 20.5H1.5Z" />
        <path className="mark" d="M12 9v5.5M12 17.4v.1" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
