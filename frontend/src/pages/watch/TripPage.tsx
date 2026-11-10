import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  addStep,
  createTravelCircle,
  endWatch,
  getWatch,
  stepsAhead,
  updateStep,
  updateWatch,
  TRIP_DELAYS,
  type Checkpoint,
  type Watch,
} from '../../api/watch';
import { listCircles, type Circle, type Membership } from '../../api/sentinel';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';
import { Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { CircleRing } from '../../components/CircleRing';
import { MapChoice } from '../../components/LinkifiedText';
import { DelaySelect, InstructionsEditor, StepFields } from '../../components/watch/WatchParts';
import {
  dayAndTime,
  tripDelay,
  emptyStep,
  formatWhen,
  stepInput,
  stepReady,
  type StepDraft,
} from '../../components/watch/watchFormat';

type Fold = 'settings' | 'steps' | null;

// The trip's page, laid out like My Circles: its fixed top (steps, what to
// do if something is wrong, what the 1st circle sees, end), then the rings —
// the 1st circle and the travel circles.
export function TripPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { watchId = '' } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const [watch, circles] = await Promise.all([getWatch(watchId), listCircles()]);
    return { watch, circles };
  }, [watchId]);
  const [fold, setFold] = useState<Fold>(null);
  const [ending, setEnding] = useState(false);
  const action = useAction();

  if (loading) return <Loading />;
  if (!data) return <p className="form-error">{error}</p>;
  const { watch, circles } = data;
  if (watch.mode !== 'TRIP') return <Navigate to="/watch/all-good" replace />;
  if (watch.closedAt) return <Navigate to="/history" replace />;

  const lang = i18n.language;
  const next = watch.checkpoints.find((c) => c.id === watch.currentCheckpointId);
  // The button names the step to validate; the fold, the one after it.
  const after = stepsAhead(watch)[0];
  const toggle = (f: Fold) => setFold(fold === f ? null : f);
  const save = (dto: Parameters<typeof updateWatch>[1]) =>
    void action.run(async () => {
      await updateWatch(watch.id, dto);
      await reload();
    });

  const addedForTrip = watch.travelCircles.flatMap((c) => c.addedForTrip.filter((p) => p.status === 'ACCEPTED'));
  const confirmEnd = () =>
    void action.run(async () => {
      if (addedForTrip.length > 0) {
        navigate(`/watch/${watch.id}/end`);
        return;
      }
      await endWatch(watch.id);
      navigate('/watch', { state: { ended: watch.label } });
    });

  // One choice: the 1st circle sees the whole trip (itinerary and
  // validations), or nothing of it until an alert.
  const shared = watch.shareItineraryWithFirstCircle || watch.shareValidationsWithFirstCircle;

  return (
    // Like My Circles: the top stays fixed, the rings scroll under it; on a
    // phone they overhang the sides and are clipped (page-bleed).
    <div className="watch-page page-bleed sticky-header-page">
      <div className="trip-head sticky-header">
        <Link to="/watch" className="back-link">
          ‹ {t('watch.title')}
        </Link>
        <div className="trip-title">
          <h1>
            <span className="trip-kind">{t('dashboard.watch.trip')}</span>
            {watch.label}
          </h1>
          <span className="watch-pill inline">{t('watch.trip.running')}</span>
        </div>
        {watch.pausedBecause && <p className="form-hint">{t(`watch.paused.${watch.pausedBecause}`)}</p>}
        {action.error && <p className="form-error">{action.error}</p>}

        {/* What was set at creation, still changeable here (not the name). */}
        <button
          type="button"
          className="trip-fold"
          aria-expanded={fold === 'settings'}
          onClick={() => toggle('settings')}
        >
          <strong>{t('watch.trip.settings')}</strong>
          <span aria-hidden="true">{fold === 'settings' ? '▴' : '▾'}</span>
        </button>
        {fold === 'settings' && (
          <div className="watch-status-card">
            <DelaySelect
              label={t('watch.step.alertAfter')}
              value={tripDelay(watch)}
              options={TRIP_DELAYS}
              onChange={(delayMinutes) => save({ delayMinutes })}
            />
            <InstructionsEditor
              initial={watch.messageAlert}
              placeholder={t('watch.instructions.tripPlaceholder')}
              onSave={(instructions) => save({ instructions })}
              busy={action.busy}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={shared}
                disabled={action.busy}
                onChange={(e) =>
                  save({
                    shareItineraryWithFirstCircle: e.target.checked,
                    shareValidationsWithFirstCircle: e.target.checked,
                  })
                }
              />
              {t('watch.see.shareTrip')}
            </label>
          </div>
        )}

        {next && (
          <Link to={`/watch/${watch.id}/validate`} className="button-link watch-primary">
            {t('watch.validate.open', { place: next.placeName ?? '', at: formatWhen(next.expectedAt, lang) })}
          </Link>
        )}

        <button type="button" className="trip-fold" aria-expanded={fold === 'steps'} onClick={() => toggle('steps')}>
          <span>
            <strong>{t('watch.steps.title')}</strong> ·{' '}
            {after
              ? t('watch.steps.after', { place: after.placeName ?? '', at: formatWhen(after.expectedAt, lang) })
              : t('watch.steps.noneAfter')}
          </span>
          <span aria-hidden="true">{fold === 'steps' ? '▴' : '▾'}</span>
        </button>
        {fold === 'steps' && <StepsList watch={watch} onChanged={reload} />}

        <button type="button" className="watch-end" onClick={() => setEnding(true)}>
          {t('watch.trip.end')}
        </button>

        <div className="trip-actions">
          <button
            type="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await createTravelCircle(watch.id, {});
                await reload();
              })
            }
          >
            {t('watch.circles.newCircle')}
          </button>
          <button
            type="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await createTravelCircle(watch.id, { group: true });
                await reload();
              })
            }
          >
            {t('watch.circles.newGroup')}
          </button>
        </div>
      </div>

      <TripRings watch={watch} circles={circles} />

      {ending && (
        <Modal title={t('watch.trip.endTitle')} onClose={() => setEnding(false)}>
          <p>{t('watch.trip.endText')}</p>
          <p className="form-hint">{t('watch.trip.endPeople')}</p>
          <div className="row">
            <button type="button" disabled={action.busy} onClick={confirmEnd}>
              {t('watch.trip.endConfirm')}
            </button>
            <button type="button" className="ghost" onClick={() => setEnding(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// The steps, each with its state, its map, and Modifier while still ahead.
function StepsList({ watch, onChanged }: { watch: Watch; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<StepDraft>(emptyStep());
  const { busy, error, run } = useAction();

  const startEdit = (c: Checkpoint) => {
    setAdding(false);
    setEditing(c.id);
    setDraft({
      placeName: c.placeName ?? '',
      ...dayAndTime(c.expectedAt),
      delayMinutes: tripDelay(watch),
      latitude: c.latitude ?? undefined,
      longitude: c.longitude ?? undefined,
    });
  };
  const saveEdit = (c: Checkpoint) =>
    void run(async () => {
      const step = stepInput(draft);
      await updateStep(watch.id, c.id, {
        placeName: step.placeName,
        latitude: draft.latitude ?? null,
        longitude: draft.longitude ?? null,
        // Unchanged time: not sent (a past time can't be sent again).
        ...(step.expectedAt !== new Date(c.expectedAt).toISOString() ? { expectedAt: step.expectedAt } : {}),
      });
      setEditing(null);
      await onChanged();
    });
  const saveNew = () =>
    void run(async () => {
      await addStep(watch.id, stepInput({ ...draft, delayMinutes: tripDelay(watch) }));
      setAdding(false);
      setDraft(emptyStep());
      await onChanged();
    });

  return (
    <div className="watch-status-card">
      <ol className="watch-steps">
        {watch.checkpoints.map((c, i) => {
          const done = !!c.validatedAt;
          const missed = !done && !!c.missedAt;
          const isNext = c.id === watch.currentCheckpointId;
          return (
            <li key={c.id} className={`watch-step${done ? ' done' : ''}${missed ? ' missed' : ''}${isNext ? ' next' : ''}`}>
              <div className="watch-step-row">
                <span className="watch-step-num">{i + 1}</span>
                <span className="watch-step-text">
                  <strong>{c.placeName}</strong>
                  <small>
                    {formatWhen(c.expectedAt, i18n.language)} ·{' '}
                    {t('watch.steps.alertIfNothing', { at: formatWhen(c.alertAt, i18n.language) })}
                  </small>
                  <span className="watch-step-status">
                    {done
                      ? c.validatedPlace
                        ? t('watch.steps.validatedElsewhere', {
                            at: formatWhen(c.validatedAt!, i18n.language),
                            place: c.validatedPlace,
                          })
                        : t('watch.steps.validated', { at: formatWhen(c.validatedAt!, i18n.language) })
                      : missed
                        ? t('watch.steps.missed')
                        : isNext
                          ? t('watch.steps.isNext')
                          : ''}
                  </span>
                </span>
                {!done && !missed && editing !== c.id && (
                  <button type="button" className="link-button" onClick={() => startEdit(c)}>
                    {t('common.edit')}
                  </button>
                )}
              </div>
              {c.latitude !== null && c.longitude !== null && (
                <MapChoice lat={c.latitude.toFixed(5)} lng={c.longitude.toFixed(5)} />
              )}
              {editing === c.id && (
                <div className="watch-status-card">
                  <StepFields value={draft} onChange={setDraft} />
                  <div className="row">
                    <button type="button" disabled={busy || !stepReady(draft)} onClick={() => saveEdit(c)}>
                      {t('common.save')}
                    </button>
                    <button type="button" className="ghost" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && <p className="form-error">{error}</p>}
      {adding ? (
        <section className="watch-section">
          <h2>{t('watch.steps.add')}</h2>
          <StepFields value={draft} onChange={setDraft} />
          <div className="row">
            <button type="button" disabled={busy || !stepReady(draft)} onClick={saveNew}>
              {t('watch.steps.addConfirm')}
            </button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="watch-add"
          onClick={() => {
            setEditing(null);
            setDraft(emptyStep());
            setAdding(true);
          }}
        >
          + {t('watch.steps.add')}
        </button>
      )}
    </div>
  );
}

// The 1st circle, then each travel circle (green), as on My Circles.
// Existing Sentinels counted on the trip show in their travel circle too.
function TripRings({ watch, circles }: { watch: Watch; circles: Circle[] }) {
  const navigate = useNavigate();
  const primary = circles.find((c) => c.circleType === 'FIRST');
  const membershipById = new Map<string, Membership>(
    circles.flatMap((c) => c.userSentinels.map((m) => [m.id, m] as const)),
  );
  const live = (c: Circle) => c.userSentinels.filter((m) => m.status === 'ACCEPTED' || m.status === 'PENDING');
  const travel = watch.travelCircles.filter((tc) => tc.status === 'ACTIVE');

  return (
    <div className="circles-overview">
      {primary && (
        <div className="circles-primary-row">
          <CircleRing label={primary.label} members={live(primary)} isPrimary colorIndex={0} size={240} showNames />
        </div>
      )}
      <div className="circles-other-row">
        {travel.map((tc) => {
          const circle = circles.find((c) => c.id === tc.id);
          const along = tc.alreadySentinels
            .map((a) => membershipById.get(a.linkId))
            .filter((m): m is Membership => !!m);
          return (
            <div key={tc.id}>
              <CircleRing
                label={tc.label}
                members={[...(circle ? live(circle) : []), ...along]}
                isPrimary={false}
                colorIndex={0}
                size={210}
                travel
                isGroup={tc.isGroup}
                showNames={!tc.isGroup}
                onOpen={() => navigate(`/circles/${tc.id}`)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
