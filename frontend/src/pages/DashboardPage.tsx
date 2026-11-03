import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { alertNeedsMe, getAlert, getMyParticipation, listAlerts, type MyAlertSummary } from '../api/alert';
import { listCircles, listCompanions, type Circle, type Companion } from '../api/sentinel';
import { Tile } from '../components/Tile';
import { SecurityScoreBar } from '../components/SecurityScoreBar';

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
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

  // Normal vs Alert mode: a "Running Alert" card takes over the top whenever
  // an active alert needs this viewer to act (see alertNeedsMe). The red
  // background itself is app-wide, set by AppShell.
  const activeAlerts = alerts.filter((a) => alertNeedsMe(a, user?.id));
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
    <div>
      {error && <p className="form-error">{error}</p>}

      {/* Every tile is a link as a whole — no separate "Open" button. */}
      {runningAlert && (
        <Link to="/running-alert" className="tile-link">
          <Tile className="alert-active" title={t('dashboard.runningAlert.title')}>
            <p className="form-hint">{t('dashboard.runningAlert.activeCount', { count: activeAlerts.length })}</p>
            <p>
              <strong>{t('dashboard.runningAlert.about')}</strong> {runningAlertName ?? runningAlert.label}
            </p>
            <p>
              <strong>{t('dashboard.runningAlert.whatToDo')}</strong> {t('dashboard.runningAlert.whatToDoHint')}
            </p>
          </Tile>
        </Link>
      )}

      <div className="tile-grid">
        <Link to="/alerts" className="tile-link">
          <Tile className="tile-raise" title={t('dashboard.raiseAlert')}>
            <p>{t('dashboard.raiseAlertHint')}</p>
          </Tile>
        </Link>
        <Link to="/circles" className="tile-link">
          <Tile title={t('dashboard.circles')}>
            <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.circlesHint', { count: sentinelCount })}</p>
            <SecurityScoreBar barOnly />
          </Tile>
        </Link>
        <Link to="/companions" className="tile-link">
          <Tile title={t('dashboard.companions')}>
            <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.companionsHint', { count: companions.length })}</p>
          </Tile>
        </Link>
      </div>
    </div>
  );
}
