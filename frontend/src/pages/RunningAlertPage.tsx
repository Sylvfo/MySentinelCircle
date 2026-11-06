import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { isOuterCircleViewer, listAlerts, type MyAlertSummary } from '../api/alert';
import { AlertDetailPanel, StopAlertButton } from './AlertsPage';

// Only reached from the Dashboard's "Running Alert" card, which only shows
// up while an alert concerning this viewer is active — this page is the
// Alert Mode counterpart to /alerts, which is for launching a new one.
// /running-alert lists the alerts in progress (or goes straight to the only
// one); /running-alert/:alertId is one alert, its summary fixed on top.
// With `chat`, /running-alert/:alertId/chat: that alert's conversations
// only, on their own page.
export function RunningAlertPage({ chat = false }: { chat?: boolean }) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const { alertId } = useParams();
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
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
  const concerns = (a: MyAlertSummary) =>
    a.userCompanionId === user?.id
      ? t('history.concernsMe')
      : [a.userCompanion.firstName, a.userCompanion.lastName].filter(Boolean).join(' ');

  if (alertId) {
    const a = ongoing.find((x) => x.id === alertId);
    if (!a) {
      // Just stopped (or already over): it lives in History now.
      return alerts.some((x) => x.id === alertId) ? (
        <Navigate to={`/history/${alertId}`} replace />
      ) : (
        <Navigate to="/running-alert" replace />
      );
    }
    if (chat) {
      return (
        // conversation-page: fixed composer + bottom room, as in Messages.
        <div className="conversation-page">
          <Link to={`/running-alert/${a.id}`}>{t('runningAlertPage.backToAlert')}</Link>
          <h1>{t('runningAlertPage.chatTitle')}</h1>
          <p style={{ color: 'var(--text-muted)' }}>{a.label}</p>
          <AlertDetailPanel alertId={a.id} view="chat" />
        </div>
      );
    }
    const launched = new Date(a.launchedAt ?? a.createdAt).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return (
      <div className="page-bleed sticky-header-page">
        <div className="sticky-header running-alert-header">
          {ongoing.length > 1 && <Link to="/running-alert">{t('runningAlertPage.backToList')}</Link>}
          <h1>
            {a.label} <span className="badge">{t(`alerts.status.${a.alertStatus}`)}</span>
          </h1>
          <p className="running-alert-meta">
            {/* Their name opens their page (with their place in this alert). */}
            {a.userCompanionId === user?.id ? (
              t('history.concerns', { who: concerns(a) })
            ) : (
              <>
                {t('history.concerns', { who: '' })}
                <Link to={`/people/${a.userCompanionId}?alert=${a.id}`}>{concerns(a)}</Link>
              </>
            )}
            {!isOuterCircleViewer(a, user?.id) && (
              <>
                {' '}
                · {t(`alerts.type.${a.alertType}`)} · {t('runningAlertPage.since', { when: launched })}
              </>
            )}
          </p>
          {/* The live statuses, read-only, right under the title — they're
              written in the 1st circle room. */}
          <p className="running-alert-status">
            <strong>{t('alerts.detail.statusByCompanion')} :</strong>{' '}
            {a.statusByCompanion ?? <span className="running-alert-meta">{t('alerts.detail.status.none')}</span>}
          </p>
          <p className="running-alert-status">
            <strong>{t('alerts.detail.statusByFirstCircle')} :</strong>{' '}
            {a.statusByFirstCircle ?? <span className="running-alert-meta">{t('alerts.detail.status.none')}</span>}
          </p>
          {/* The 1st-circle chat lives on its own page (the companion reads
              it, the 1st circle writes in it). */}
          {!isOuterCircleViewer(a, user?.id) && (
            <Link to={`/running-alert/${a.id}/chat`} className="button-link running-alert-chat-link">
              {t('runningAlertPage.openChat')}
            </Link>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <AlertDetailPanel alertId={a.id} footer={<StopAlertButton alert={a} onStopped={reload} />} />
      </div>
    );
  }

  if (ongoing.length === 1) return <Navigate to={`/running-alert/${ongoing[0].id}`} replace />;

  return (
    <div>
      <h1>{t('runningAlertPage.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('runningAlertPage.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {ongoing.length === 0 ? (
        <div className="empty-state">{t('runningAlertPage.empty')}</div>
      ) : (
        <section className="panel history-list">
          {ongoing.map((a) => (
            <Link key={a.id} to={`/running-alert/${a.id}`} className="history-row">
              <span className="history-label">{a.label}</span>
              <span className="history-meta">
                {t('history.concerns', { who: concerns(a) })} · {t(`alerts.status.${a.alertStatus}`)}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
