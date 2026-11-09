import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isOuterCircleViewer, listAlerts, type MyAlertSummary } from '../api/alert';
import { useLoad } from '../useLoad';
import { AlertDetailPanel } from '../components/AlertDetailPanel';
import { StopAlertButton } from '../components/StopAlertButton';
import { useSocketEvent } from '../realtime/useSocketEvent';
import { Loading } from '../components/Loading';

// Only reached from the Dashboard's "Running Alert" card, which only shows
// up while an alert concerning this viewer is active — this page is the
// Alert Mode counterpart to /alerts, which is for launching a new one.
// /running-alert lists the alerts in progress (or goes straight to the only
// one); /running-alert/:alertId is one alert, its summary fixed on top.
// Its chats live in Messages (/running-alert/:alertId/chat redirects there).
export function RunningAlertPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { alertId } = useParams();
  const { data: alerts = [], loading, error, reload } = useLoad(listAlerts);

  useSocketEvent('alert:changed', reload);

  if (loading) return <Loading />;

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
              written in the 1st circle room. Nothing shown until written. */}
          {a.statusByCompanion && (
            <p className="running-alert-status">
              <strong>{t('alerts.detail.statusByCompanion')} :</strong> {a.statusByCompanion}
            </p>
          )}
          {a.statusByFirstCircle && (
            <p className="running-alert-status">
              <strong>{t('alerts.detail.statusByFirstCircle')} :</strong> {a.statusByFirstCircle}
            </p>
          )}
          {/* The 1st-circle room lives in Messages (this link redirects
              there, see AlertChatRedirect). */}
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
      <p className="muted">{t('runningAlertPage.intro')}</p>
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
