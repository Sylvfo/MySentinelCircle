import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { isOuterCircleViewer, listAlerts, type MyAlertSummary } from '../api/alert';
import { AlertDetailPanel } from './AlertsPage';

// Resolved alerts only — AlertsPage shows everything still in progress,
// this is where they land once closed, so the two never overlap.
// /history lists them; /history/:alertId is one alert's details.
export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { alertId } = useParams();
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const resolved = alerts.filter((a) => a.alertStatus === 'RESOLVED');
  const concerns = (a: MyAlertSummary) =>
    a.userCompanionId === user?.id
      ? t('history.concernsMe')
      : [a.userCompanion.firstName, a.userCompanion.lastName].filter(Boolean).join(' ');
  const date = (a: MyAlertSummary) => new Date(a.closedAt ?? a.createdAt).toLocaleDateString(i18n.language);

  if (alertId) {
    const a = resolved.find((x) => x.id === alertId);
    if (!a) return <Navigate to="/history" replace />;
    return (
      <div>
        <Link to="/history">{t('history.backToList')}</Link>
        <h1>{a.label}</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          {t('history.concerns', { who: concerns(a) })}
          {!isOuterCircleViewer(a, user?.id) && ` · ${t(`alerts.type.${a.alertType}`)}`} · {date(a)}
        </p>
        <AlertDetailPanel alertId={a.id} />
      </div>
    );
  }

  return (
    <div>
      <h1>{t('history.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('history.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {resolved.length === 0 ? (
        <div className="empty-state">{t('history.empty')}</div>
      ) : (
        <section className="panel history-list">
          {/* Name/keyword first, then who it was about; click for details. */}
          {resolved.map((a) => (
            <Link key={a.id} to={`/history/${a.id}`} className="history-row">
              <span className="history-label">{a.label}</span>
              <span className="history-meta">
                {t('history.concerns', { who: concerns(a) })} · {date(a)}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
