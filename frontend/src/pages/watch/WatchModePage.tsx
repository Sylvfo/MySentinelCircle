import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { listMyWatches } from '../../api/watch';
import { useLoad } from '../../useLoad';
import { usePlan } from '../../plan';
import { Loading } from '../../components/Loading';
import { Tile } from '../../components/Tile';
import { PaidPill, SubscriptionModal } from '../../components/Upgrade';
import { IncludedStar } from '../../components/SubscribedStar';
import { currentCheckpoint } from '../../api/watch';

// Mode veille: a trip, or a regular All Good Check — never both counting at
// once (the check rests during a trip).
export function WatchModePage() {
  const { t } = useTranslation();
  const ended = (useLocation().state as { ended?: string } | null)?.ended;
  const { data: watches = [], loading, error } = useLoad(listMyWatches);
  const { plan } = usePlan();
  const [paidOpen, setPaidOpen] = useState(false);
  if (loading) return <Loading />;

  const trip = watches.find((w) => w.mode === 'TRIP');
  const allGood = watches.find((w) => w.mode === 'ALL_GOOD');
  const tripPlace = trip ? currentCheckpoint(trip)?.placeName : null;
  const locked = plan !== null && !plan.hasPaid;
  // Paid features: a gold star for subscribers, the lock pill otherwise.
  const star = plan?.hasPaid ? <IncludedStar /> : locked ? <PaidPill feature="travel" /> : null;
  // Free account: the page can be read, but starting a watch opens the
  // subscription popup instead of the form.
  const paidOnly = (running: boolean) => (e: MouseEvent) => {
    if (locked && !running) {
      e.preventDefault();
      setPaidOpen(true);
    }
  };

  return (
    <div className="watch-page">
      <Link to="/alerts" className="back-link">
        ‹ {t('alerts.title')}
      </Link>
      <div>
        <h1>
          {t('watch.title')}
          {star}
        </h1>
        <p>{t('watch.intro')}</p>
      </div>
      {ended && <p className="watch-done">{t('watch.trip.ended', { name: ended })}</p>}
      {error && <p className="form-error">{error}</p>}

      <Link to={trip ? `/watch/${trip.id}` : '/watch/trip/new'} className="tile-link" onClick={paidOnly(!!trip)}>
        <Tile
          className="tile-watch"
          title={
            <h2>
              {t('watch.trip.title')}
              {star}
            </h2>
          }
        >
          <p>{t('watch.trip.hint')}</p>
          {trip && (
            <span className="watch-pill">
              {tripPlace ? t('watch.pill.tripAt', { place: tripPlace }) : t('watch.pill.tripOn')}
            </span>
          )}
        </Tile>
      </Link>

      <Link to="/watch/all-good" className="tile-link" onClick={paidOnly(!!allGood)}>
        <Tile
          className="tile-watch"
          title={
            <h2>
              {t('watch.allGood.title')}
              {star}
            </h2>
          }
        >
          <p>{t('watch.allGood.hint')}</p>
          {allGood && (
            <span className={`watch-pill${allGood.pausedBecause ? ' paused' : ''}`}>
              {allGood.pausedBecause ? t(`watch.pill.paused.${allGood.pausedBecause}`) : t('watch.pill.on')}
            </span>
          )}
        </Tile>
      </Link>
      {paidOpen && <SubscriptionModal onClose={() => setPaidOpen(false)} />}
    </div>
  );
}
