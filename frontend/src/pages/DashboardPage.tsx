import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { getAlert, getMyParticipation, listAlerts, type AlertSummary } from '../api/alert';
import { listCircles, listCompanions, type Circle, type Companion } from '../api/sentinel';
import { Tile } from '../components/Tile';

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAlertName, setRunningAlertName] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAlerts(), listCircles(), listCompanions()])
      .then(([a, c, comp]) => {
        setAlerts(a);
        setCircles(c);
        setCompanions(comp);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  // Normal vs Alert mode: a "Running Alert" card takes over the top of the
  // dashboard whenever any alert concerning this viewer (their own, or one
  // they're a Sentinel participant on) is still active.
  const activeAlerts = alerts.filter((a) => a.alertStatus !== 'RESOLVED');
  const runningAlert = activeAlerts[0] ?? null;
  // "People watching over you" counts Sentinels, not circles — sum of
  // accepted members across every real circle (the system reserve circle
  // isn't a real one to count).
  const sentinelCount = circles
    .filter((c) => c.circleType !== 'RESERVED')
    .reduce((sum, c) => sum + c.userSentinels.filter((m) => m.status === 'ACCEPTED').length, 0);

  // "About" must name the companion the alert concerns, not the alert's own
  // label. Self-raised alerts need no extra call; otherwise fall back the
  // same way AlertsPage's detail panel does (an outer-circle Sentinel can
  // get a 403 from getAlert and needs the lighter getMyParticipation view).
  useEffect(() => {
    const resolveName = async () => {
      if (!runningAlert) {
        setRunningAlertName(null);
        return;
      }
      if (runningAlert.userCompanionId === user?.id) {
        setRunningAlertName(user?.firstName ?? null);
        return;
      }
      try {
        const detail = await getAlert(runningAlert.id);
        setRunningAlertName(detail.userCompanion.firstName);
      } catch {
        try {
          const participation = await getMyParticipation(runningAlert.id);
          setRunningAlertName(participation.alert.userCompanion.firstName);
        } catch {
          setRunningAlertName(null);
        }
      }
    };
    void resolveName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningAlert?.id, user?.id]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  return (
    <div className={runningAlert ? 'mode-alert' : undefined}>
      {error && <p className="form-error">{error}</p>}

      {runningAlert && (
        <Tile className="alert-active" title={t('dashboard.runningAlert.title')}>
          <p className="form-hint">{t('dashboard.runningAlert.activeCount', { count: activeAlerts.length })}</p>
          <p>
            <strong>{t('dashboard.runningAlert.about')}</strong> {runningAlertName ?? runningAlert.label}
          </p>
          <p>
            <strong>{t('dashboard.runningAlert.whatToDo')}</strong> {t('dashboard.runningAlert.whatToDoHint')}
          </p>
          <Link to="/running-alert">{t('dashboard.runningAlert.viewDetails')}</Link>
        </Tile>
      )}

      <div className="tile-grid">
        <Tile title={t('dashboard.raiseAlert')} actions={<Link to="/alerts">{t('dashboard.open')}</Link>}>
          <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.raiseAlertHint')}</p>
        </Tile>
        <Tile title={t('dashboard.circles')} actions={<Link to="/circles">{t('dashboard.open')}</Link>}>
          <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.circlesHint', { count: sentinelCount })}</p>
        </Tile>
        <Tile title={t('dashboard.companions')} actions={<Link to="/companions">{t('dashboard.open')}</Link>}>
          <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.companionsHint', { count: companions.length })}</p>
        </Tile>
      </div>
    </div>
  );
}
