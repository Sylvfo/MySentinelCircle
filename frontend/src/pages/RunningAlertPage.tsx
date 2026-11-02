import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { listAlerts, type AlertSummary } from '../api/alert';
import { AlertRow } from './AlertsPage';
import { Tile } from '../components/Tile';

// Only reached from the Dashboard's "Running Alert" card, which only shows
// up while an alert concerning this viewer is active — this page is the
// Alert Mode counterpart to /alerts, which is for launching a new one.
export function RunningAlertPage() {
  const { t } = useTranslation();
  const { socket } = useAuth();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    try {
      setAlerts(await listAlerts());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('alert:changed', reload);
    return () => {
      socket.off('alert:changed', reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const ongoing = alerts.filter((a) => a.alertStatus !== 'RESOLVED');

  return (
    <div className="mode-alert">
      <h1>{t('runningAlertPage.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('runningAlertPage.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {ongoing.length === 0 ? (
        <div className="empty-state">{t('runningAlertPage.empty')}</div>
      ) : (
        <Tile>
          {ongoing.map((a) => (
            <AlertRow key={a.id} alert={a} onChange={reload} />
          ))}
        </Tile>
      )}
    </div>
  );
}
