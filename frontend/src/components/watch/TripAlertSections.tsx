import { useTranslation } from 'react-i18next';
import { updateAlertType, type AlertDetail, type AlertType } from '../../api/alert';
import { useAction } from '../../useAction';
import { MapChoice } from '../LinkifiedText';
import { formatWhen } from './watchFormat';

type Trip = NonNullable<AlertDetail['trip']>;

// An alert opened by a missed Watch Mode deadline, for its 1st circle:
// first try to reach them — the traveller, then the people with them —
// and only then follow their instructions (in "À savoir").
export function TripAlertGuide({ detail }: { detail: AlertDetail }) {
  const { t } = useTranslation();
  const trip = detail.trip!;
  const name = detail.userCompanion.firstName;
  const isTrip = trip.alertType === 'TRAVEL';
  return (
    <section className="where-card">
      <h3>{t('watch.alert.reachFirst')}</h3>
      <ol>
        <li>{t('watch.alert.callThem', { name })}</li>
        {isTrip && trip.tripCircles.length > 0 && (
          <li>{t('watch.alert.callTravelCircle', { circles: trip.tripCircles.map((c) => c.label).join(', ') })}</li>
        )}
        <li>{t('watch.alert.thenInstructions')}</li>
      </ol>
    </section>
  );
}

// "Le voyage": the steps, what was validated (and where), the logbook, and
// each point on a map. For an All Good Check: its deadlines.
export function TripTimeline({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const lastNews = trip.checkpoints
    .filter((c) => c.validatedAt)
    .sort((a, b) => b.validatedAt!.localeCompare(a.validatedAt!))[0];
  return (
    <div className="watch-status-card">
      <p>
        <strong>{t('watch.alert.lastNews')}</strong>{' '}
        {lastNews ? formatWhen(lastNews.validatedAt!, lang) : t('watch.alert.noNews')}
      </p>
      <ol className="watch-steps">
        {trip.checkpoints.map((c, i) => {
          const point =
            c.validatedLatitude !== null && c.validatedLongitude !== null
              ? { lat: c.validatedLatitude, lng: c.validatedLongitude }
              : c.latitude !== null && c.longitude !== null
                ? { lat: c.latitude, lng: c.longitude }
                : null;
          return (
            <li
              key={c.id}
              className={`watch-step${c.validatedAt ? ' done' : ''}${!c.validatedAt && c.missedAt ? ' missed' : ''}`}
            >
              <div className="watch-step-row">
                <span className="watch-step-num">{i + 1}</span>
                <span className="watch-step-text">
                  <strong>{c.placeName ?? t('watch.allGood.title')}</strong>
                  <small>{t('watch.alert.planned', { at: formatWhen(c.expectedAt, lang) })}</small>
                  <span className="watch-step-status">
                    {c.validatedAt
                      ? c.validatedPlace
                        ? t('watch.steps.validatedElsewhere', { at: formatWhen(c.validatedAt, lang), place: c.validatedPlace })
                        : t('watch.steps.validated', { at: formatWhen(c.validatedAt, lang) })
                      : c.missedAt
                        ? t('watch.steps.missed')
                        : ''}
                  </span>
                  {c.validatedNote && <small>« {c.validatedNote} »</small>}
                </span>
              </div>
              {point && <MapChoice lat={point.lat.toFixed(5)} lng={point.lng.toFixed(5)} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// "Changer le type d'alerte": a disappearance, an emergency, or back to
// its own type (never the other Watch Mode's).
export function RequalifyButtons({ detail, onChange }: { detail: AlertDetail; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const types: AlertType[] = [detail.trip!.alertType, 'MISSING', 'EMERGENCY'];
  return (
    <div className="watch-status-card">
      <p className="form-hint">{t('watch.alert.changeTypeHint')}</p>
      <div className="row">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className={type === detail.alertType ? 'ghost' : undefined}
            disabled={busy || type === detail.alertType}
            onClick={() =>
              void run(async () => {
                await updateAlertType(detail.id, type);
                await onChange();
              })
            }
          >
            {t(`alerts.type.${type}`)}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
