import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isOuterCircleViewer, listAlerts, type MyAlertSummary } from '../api/alert';
import { useLoad } from '../useLoad';
import { watchHistory, type WatchHistory } from '../api/watch';
import { AlertDetailPanel } from '../components/AlertDetailPanel';
import { Loading } from '../components/Loading';

// Resolved alerts only — AlertsPage shows everything still in progress,
// this is where they land once closed, so the two never overlap.
// /history lists them; /history/:alertId is one alert's details.
export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { alertId } = useParams();
  const { data, loading, error } = useLoad(async () => {
    const [alerts, watches] = await Promise.all([
      listAlerts(),
      watchHistory().catch((): WatchHistory => ({ mine: [], withOthers: [] })),
    ]);
    return { alerts, watches };
  });
  const alerts = data?.alerts ?? [];
  const watches = data?.watches ?? { mine: [], withOthers: [] };

  if (loading) return <Loading />;

  const resolved = alerts.filter((a) => a.alertStatus === 'RESOLVED');
  // Alerts opened by one of my watches are listed under it instead.
  const myWatchIds = new Set(watches.mine.map((w) => w.id));
  const loose = resolved.filter((a) => !a.tripId || !myWatchIds.has(a.tripId));
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  const period = (w: { createdAt: string; closedAt: string | null }) =>
    w.closedAt ? `${day(w.createdAt)} – ${day(w.closedAt)}` : `${day(w.createdAt)} · ${t('history.watch.running')}`;
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
        <p className="muted">
          {t('history.concerns', { who: concerns(a) })}
          {!isOuterCircleViewer(a, user?.id) && ` · ${t(`alerts.type.${a.alertType}`)}`} · {date(a)}
        </p>
        <AlertDetailPanel alertId={a.id} />
        {/* The alert's conversations, read back below the details. */}
        <h2 className="history-chat-title">{t('alerts.detail.sections.discussion')}</h2>
        <AlertDetailPanel alertId={a.id} view="chat" />
      </div>
    );
  }

  return (
    <div>
      <h1>{t('history.title')}</h1>
      <p className="muted">{t('history.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      {/* Watch Mode: one line per trip, per All Good period, with the
          alerts each one opened nested under it. */}
      {watches.mine.length > 0 && (
        <section className="panel history-list">
          {watches.mine.map((w) => (
            <div key={w.id} className="history-watch">
              {/* Ended: nothing more to open. Still going: its page. */}
              {w.closedAt ? (
                <div className="history-row static">
                  <span className="history-label">
                    <span className="watch-pill inline">
                      {w.mode === 'TRIP' ? t('history.watch.trip') : t('watch.allGood.title')}
                    </span>{' '}
                    {w.mode === 'TRIP' && w.label}
                  </span>
                  <span className="history-meta">{period(w)}</span>
                </div>
              ) : (
                <Link to={w.mode === 'TRIP' ? `/watch/${w.id}` : '/watch/all-good'} className="history-row">
                  <span className="history-label">
                    <span className="watch-pill inline">
                      {w.mode === 'TRIP' ? t('history.watch.trip') : t('watch.allGood.title')}
                    </span>{' '}
                    {w.mode === 'TRIP' && w.label}
                  </span>
                  <span className="history-meta">{period(w)}</span>
                </Link>
              )}
              {w.tripAlerts.map((a) => (
                <Link
                  key={a.id}
                  to={a.alertStatus === 'RESOLVED' ? `/history/${a.id}` : `/running-alert/${a.id}`}
                  className="history-row nested"
                >
                  <span className="history-label">{a.label}</span>
                  <span className="history-meta">
                    {t(`alerts.type.${a.alertType}`)} · {day(a.closedAt ?? a.launchedAt ?? w.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      )}
      {watches.withOthers.length > 0 && (
        <section className="panel history-list">
          <h2 className="history-section">{t('history.watch.withOthers')}</h2>
          {watches.withOthers.map((w) => (
            <Link key={w.id} to={`/people/${w.userCompanion.id}?from=companion`} className="history-row">
              <span className="history-label">
                <span className="watch-pill inline">{t('history.watch.trip')}</span> {w.label}
              </span>
              <span className="history-meta">
                {t('history.concerns', {
                  who: [w.userCompanion.firstName, w.userCompanion.lastName].filter(Boolean).join(' '),
                })}{' '}
                · {period(w)}
              </span>
            </Link>
          ))}
        </section>
      )}

      {loose.length === 0 ? (
        watches.mine.length === 0 && <div className="empty-state">{t('history.empty')}</div>
      ) : (
        <section className="panel history-list">
          {/* Name/keyword first, then who it was about; click for details. */}
          {loose.map((a) => (
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
