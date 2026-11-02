import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { listAlerts, type AlertSummary } from '../api/alert';
import { AlertRow } from './AlertsPage';
import { Tile } from '../components/Tile';

// Resolved alerts only — AlertsPage shows everything still in progress,
// this is where they land once closed, so the two never overlap.
export function HistoryPage() {
  const { t } = useTranslation();
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

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const resolved = alerts.filter((a) => a.alertStatus === 'RESOLVED');

  return (
    <div>
      <h1>{t('history.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('history.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {resolved.length === 0 ? (
        <div className="empty-state">{t('history.empty')}</div>
      ) : (
        <Tile>
          {resolved.map((a) => (
            <AlertRow key={a.id} alert={a} onChange={reload} />
          ))}
        </Tile>
      )}
    </div>
  );
}
