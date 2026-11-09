import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listAlerts } from '../api/alert';
import { useLoad } from '../useLoad';
import { Tile } from '../components/Tile';
import { PaidPill } from '../components/Upgrade';
import { IncludedStar } from '../components/SubscribedStar';
import { usePlan } from '../plan';
import { Loading } from '../components/Loading';
import { RaiseAlertPage } from './RaiseAlertPage';

export function AlertsPage() {
  const { t } = useTranslation();
  const { kind } = useParams();
  const { user } = useAuth();
  const { data: alerts = [], loading, error } = useLoad(listAlerts);
  // Paid features shown with a lock on a free account.
  const { plan: tilesPlan } = usePlan();

  if (loading) return <Loading />;

  const myActiveAlert = alerts.find((a) => a.userCompanionId === user?.id && a.alertStatus !== 'RESOLVED');

  // /alerts/:kind — one tile's own page.
  if (kind === 'self' || kind === 'missing' || kind === 'assistance') {
    return <RaiseAlertPage kind={kind} activeAlert={myActiveAlert} />;
  }
  if (kind) return <Navigate to="/alerts" replace />;

  // This page is for launching a new alert only — any alert already in
  // progress lives on its own /running-alert page instead (reached from the
  // Dashboard's "Running Alert" card, which only shows up while one exists).
  // Subscribed: unlimited alerts are part of what I pay for.
  const paidTitle = (title: string) =>
    tilesPlan?.hasPaid ? (
      <h2>
        {title}
        <IncludedStar />
      </h2>
    ) : (
      title
    );

  return (
    <div>
      <h1>{t('alerts.title')}</h1>
      <p className="muted">{t('alerts.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      <div className="tile-grid raise-grid">
        <Link to="/alerts/self" className="tile-link">
          <Tile className="tile-raise" title={paidTitle(t('alerts.tiles.self.title'))}>
            <p>{myActiveAlert ? t('alerts.activeAlertNotice') : t('alerts.tiles.self.hint')}</p>
          </Tile>
        </Link>
        <Link to="/alerts/missing" className="tile-link">
          <Tile title={paidTitle(t('alerts.tiles.missing.title'))}>
            <p>{t('alerts.tiles.missing.hint')}</p>
          </Tile>
        </Link>
        <Link to="/alerts/assistance" className="tile-link">
          <Tile title={paidTitle(t('alerts.tiles.assistance.title'))}>
            <p>{t('alerts.tiles.assistance.hint')}</p>
          </Tile>
        </Link>
        {/* Not built yet — shown so people know it's coming, not clickable. */}
        <Tile className="tile-soon" title={t('alerts.tiles.travel.title')}>
          <p>{t('alerts.tiles.travel.hint')}</p>
          <span className="badge">{t('alerts.tiles.soon')}</span>
          {tilesPlan && !tilesPlan.hasPaid && <PaidPill feature="travel" />}
        </Tile>
      </div>
    </div>
  );
}
