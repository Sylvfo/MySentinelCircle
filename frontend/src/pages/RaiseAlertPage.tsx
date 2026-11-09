import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../api/client';
import { raiseAlert, type AlertLocation, type AlertSummary, type AlertType } from '../api/alert';
import { formatAccuracy, useLocate } from '../geolocation';
import { listCompanions, type Companion } from '../api/sentinel';
import { addSubscriptionYear, updatePause } from '../api/user';
import { Tile } from '../components/Tile';
import { PayForAlertChoice } from '../components/Upgrade';
import { DictateButton } from '../components/DictateButton';
import { upgradeReasonOf, usePlan } from '../plan';
import { genderContext } from '../gender';
import { ApproximateWarning } from '../components/AlertDetailActions';

// The 4 ways to raise an alert, one tile each. "For myself" is always
// BYCOMPANION; the two "for someone I watch over" tiles map to one type each;
// travel mode isn't built yet. LITTLEWORRY/EMERGENCY/NOCONTACT/UNKNOWN still
// exist in the schema but aren't offered from here.
type RaiseKind = 'self' | 'missing' | 'assistance';
const RAISE_TYPE: Record<RaiseKind, AlertType> = {
  self: 'BYCOMPANION',
  missing: 'MISSING',
  assistance: 'INCIDENT',
};

// One form for all 3 tiles. Everything is optional: in a real emergency the
// big button alone must be enough. The DB has two fields for this —
// messageAlert (what's happening + what's needed, set once at launch) and
// a status note: statusByCompanion when raising for myself,
// statusByFirstCircle when a 1st-circle Sentinel raises for their companion
// (outside the 1st circle you can raise but not write a status, so the
// field is hidden).
export function RaiseAlertPage({ kind, activeAlert }: { kind: RaiseKind; activeAlert: AlertSummary | undefined }) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const forSelf = kind === 'self';
  // On pause for others, raising for someone whose 1st circle I'm in: I'd
  // be left out of my own alert — so I'm asked first whether to lift my
  // pause and take part, or raise it without taking part.
  const [askPause, setAskPause] = useState(false);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loadingCompanions, setLoadingCompanions] = useState(!forSelf);
  const [companionId, setCompanionId] = useState('');
  // Two things only, both optional: what's happening, and where.
  const [situation, setSituation] = useState('');
  const [place, setPlace] = useState('');
  // My GPS position, only if I tap the button: for an alert about myself,
  // or for an assistance alert when I'm with the person.
  const [location, setLocation] = useState<AlertLocation | null>(null);
  const { locate: findPosition, locating, error: locateError } = useLocate();
  const locate = () => void findPosition().then((loc) => loc && setLocation(loc));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Free trial: a limited number of alerts about me, for life.
  const { plan, reload: reloadPlan } = usePlan();
  const trialUsedUp = forSelf && plan?.freeAlertsLeft === 0;
  const upgradeReason = upgradeReasonOf(error);

  useEffect(() => {
    if (forSelf) return;
    // Any Sentinel (any circle) is authorized to raise — it always notifies
    // the companion's 1st circle regardless of which circle the raiser is in.
    listCompanions()
      .then((all) => {
        setCompanions(all);
        // Someone on pause for me can't be alerted by anyone else.
        const first = all.find((c) => !c.companion.pausedForMe);
        if (first) setCompanionId(first.companion.id);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoadingCompanions(false));
  }, [forSelf]);

  const selectedCompanion = companions.find((c) => c.companion.id === companionId);
  // Someone needs assistance: we must be able to find them, so both
  // questions are required. Everything is optional otherwise.
  const bothRequired = kind === 'assistance';
  const missingRequired = bothRequired && (!situation.trim() || (!place.trim() && !location));

  const pausedInTheirFirstCircle =
    !forSelf && !!user?.pausedForOthers && !!companions.find((c) => c.companion.id === companionId)?.circle.isPrimary;

  const raise = async (join = true, payForThisAlert = false) => {
    const targetId = forSelf ? user?.id : companionId;
    if (!targetId) return;
    setSubmitting(true);
    setError(null);
    const reason = [situation.trim(), place.trim() && `${t('alerts.placePrefix')} ${place.trim()}`]
      .filter(Boolean)
      .join('\n\n');
    try {
      if (pausedInTheirFirstCircle && join) {
        await updatePause({ pausedForOthers: false });
        await refreshUser();
      }
      await raiseAlert({
        companionId: targetId,
        alertType: RAISE_TYPE[kind],
        reason: reason || t('alerts.defaultReason'),
        ...(location && kind !== 'missing' ? { location } : {}),
        ...(payForThisAlert ? { payForThisAlert } : {}),
      });
      // Not taking part: there's no running alert for me to follow.
      navigate(pausedInTheirFirstCircle && !join ? '/dashboard' : '/running-alert');
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  };

  // Past the free alert: offer (or take) a year of subscription, then
  // raise; or pay for this one alert only.
  const raiseAfterPaying = async (how: 'year' | 'single') => {
    if (how === 'year') {
      setSubmitting(true);
      try {
        await addSubscriptionYear(forSelf ? undefined : companionId);
      } catch (err) {
        setError(errorText(err));
        setSubmitting(false);
        return;
      }
      reloadPlan();
      return raise(true);
    }
    return raise(true, true);
  };

  const header = (
    <>
      <Link to="/alerts">{t('alerts.backToTiles')}</Link>
      <h1>{t(`alerts.tiles.${kind}.title`)}</h1>
    </>
  );

  if (forSelf && activeAlert) {
    return (
      <div>
        {header}
        <Tile className="alert-active">
          <p>{t('alerts.activeAlertNotice')}</p>
          <Link to="/running-alert" className="button-link">
            {t('alerts.seeRunningAlert')}
          </Link>
        </Tile>
      </div>
    );
  }

  if (loadingCompanions) return header;
  if (!forSelf && companions.length === 0) {
    return (
      <div>
        {header}
        <div className="empty-state">{t('alerts.noCompanions')}</div>
      </div>
    );
  }

  const f = forSelf ? 'self' : 'other';
  return (
    <div>
      {header}
      <Tile className="raise-self-form">
        {!forSelf && (
          <label>
            {t('alerts.whoLabel')}
            <select value={companionId} onChange={(e) => setCompanionId(e.target.value)}>
              {companions.map((c) => (
                <option key={c.linkId} value={c.companion.id} disabled={c.companion.pausedForMe}>
                  {[c.companion.firstName, c.companion.lastName].filter(Boolean).join(' ')}
                  {c.companion.pausedForMe ? ` — ${t('pause.raiseOption')}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {/* 1. What's happening — written or dictated. */}
        <div className="raise-field">
          <label htmlFor="raise-situation">{t(`alerts.${f}.situationLabel`)}</label>
          <textarea
            id="raise-situation" maxLength={1500}
            rows={3}
            placeholder={t(`alerts.${f}.situationPlaceholder`)}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
          />
          <div className="raise-actions">
            <DictateButton onText={(text) => setSituation((cur) => appendText(cur, text))} />
          </div>
        </div>
        {/* 2. Where — written, dictated, or a GPS position (mine: for
            myself, or for an assistance alert when I'm with the person).
            Not asked for someone missing: nobody knows where they are. */}
        {kind !== 'missing' && (
          <div className="raise-field">
            <label htmlFor="raise-place">
              {forSelf
                ? t('alerts.self.whereLabel')
                : t('alerts.other.whereLabel', {
                    name: selectedCompanion?.companion.firstName ?? '',
                    context: genderContext(selectedCompanion?.companion.gender),
                  })}
            </label>
            <input
              id="raise-place" maxLength={300}
              placeholder={t(`alerts.${f}.wherePlaceholder`)}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
            <div className="raise-actions">
              <DictateButton onText={(text) => setPlace((cur) => appendText(cur, text))} />
              {!location && (
                <button type="button" className="raise-action-btn" disabled={locating} onClick={locate}>
                  📍 {locating ? t('alerts.location.locating') : t(`alerts.location.${forSelf ? 'add' : 'addMine'}`)}
                </button>
              )}
            </div>
            {location ? (
              <div className="alert-location">
                <p>
                  📍 {t('alerts.location.added', { accuracy: formatAccuracy(location.accuracy ?? 0) })}{' '}
                  <button type="button" className="link-button" onClick={() => setLocation(null)}>
                    {t('alerts.location.remove')}
                  </button>
                </p>
                <ApproximateWarning location={location} />
              </div>
            ) : (
              <small className="raise-hint">
                {locateError
                  ? t(`alerts.location.${locateError}`)
                  : t(`alerts.location.${forSelf ? 'hint' : 'hintMine'}`)}
              </small>
            )}
          </div>
        )}
        {missingRequired && <p className="form-hint">{t('alerts.other.bothRequired')}</p>}
        {forSelf && plan && plan.freeAlertsLeft !== null && plan.freeAlertsLeft > 0 && (
          <p className="form-hint">
            {t('plans.alertsLeft', {
              count: plan.freeAlertsLeft,
              limit: plan.freeAlertLimit,
            })}
          </p>
        )}
        {trialUsedUp ? (
          <PayForAlertChoice plan={plan} name={null} submitting={submitting} onRaise={raiseAfterPaying} />
        ) : askPause && pausedInTheirFirstCircle ? (
          <div className="pause-raise-choice">
            <p>{t('pause.raise.question')}</p>
            <button className="alert-btn" disabled={submitting} onClick={() => void raise(true)}>
              {t('pause.raise.join')}
            </button>
            <button type="button" className="link-button" disabled={submitting} onClick={() => void raise(false)}>
              {t('pause.raise.withoutMe')}
            </button>
          </div>
        ) : (
          <button
            className="alert-btn"
            disabled={submitting || missingRequired || (forSelf ? !user : !companionId)}
            onClick={() => (pausedInTheirFirstCircle ? setAskPause(true) : void raise())}
          >
            {forSelf ? t('alerts.raiseForSelf') : t('alerts.submit')}
          </button>
        )}
        {upgradeReason === 'alerts'
          ? // Their free alert is used and they have no subscription.
            !trialUsedUp && (
              <PayForAlertChoice
                plan={plan}
                name={
                  forSelf ? null : (companions.find((c) => c.companion.id === companionId)?.companion.firstName ?? '')
                }
                gender={forSelf ? null : companions.find((c) => c.companion.id === companionId)?.companion.gender}
                submitting={submitting}
                onRaise={raiseAfterPaying}
              />
            )
          : error && <p className="form-error">{error}</p>}
      </Tile>
    </div>
  );
}

// Adds a dictated sentence after what's already written.
function appendText(current: string, added: string): string {
  if (!added) return current;
  return current.trim() ? `${current.trim()} ${added}` : added;
}
