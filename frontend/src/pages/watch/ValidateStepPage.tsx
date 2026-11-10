import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  addStep,
  getWatch,
  minutesBetween,
  stepsAhead,
  validateWatch,
  type ValidateInput,
  type Watch,
} from '../../api/watch';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';
import { useLocate } from '../../geolocation';
import { Loading } from '../../components/Loading';
import { StepFields } from '../../components/watch/WatchParts';
import { emptyStep, formatWhen, stepInput, stepReady, tripDelay } from '../../components/watch/watchFormat';

// "Je suis là, comme prévu" / "Je suis ailleurs, mais tout va bien", the
// GPS position if I want, a logbook note. Then what comes next is never
// left open: confirm the next step, or plan one, or end the trip.
export function ValidateStepPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { watchId = '' } = useParams();
  const { data: watch, loading, error, reload } = useLoad(() => getWatch(watchId), [watchId]);
  const [kind, setKind] = useState<'AS_PLANNED' | 'ELSEWHERE'>('AS_PLANNED');
  const [place, setPlace] = useState('');
  const [withPosition, setWithPosition] = useState(true);
  const [note, setNote] = useState('');
  const [nextDraft, setNextDraft] = useState(emptyStep());
  // After validating: the step just done, and whether the next one is
  // confirmed ("Oui, toujours bon").
  const [done, setDone] = useState<{ text: string } | null>(null);
  const [nextOk, setNextOk] = useState(false);
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState(emptyStep());
  const { locate, locating, error: locateError } = useLocate();
  const action = useAction();

  if (loading) return <Loading />;
  if (!watch) return <p className="form-error">{error}</p>;
  if (watch.mode !== 'TRIP') return <Navigate to="/watch/all-good" replace />;
  const lang = i18n.language;
  const current = watch.checkpoints.find((c) => c.id === watch.currentCheckpointId);
  const index = current ? watch.checkpoints.indexOf(current) + 1 : 0;
  const ahead = stepsAhead(watch);
  const logbook = watch.checkpoints
    .filter((c) => c.validatedAt)
    .sort((a, b) => b.validatedAt!.localeCompare(a.validatedAt!));

  // What gets sent: the choice, place, position, note.
  const payload = async (): Promise<ValidateInput> => {
    const pos = withPosition ? await locate() : null;
    return {
      kind,
      ...(kind === 'ELSEWHERE' ? { place: place.trim() } : {}),
      ...(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
  };
  const doneText = (sent: ValidateInput, at: Date) => {
    const late = current ? minutesBetween(current.expectedAt, at.toISOString()) : 0;
    const timing =
      late > 5
        ? t('watch.validate.late', { count: late })
        : late < -5
          ? t('watch.validate.early', { count: -late })
          : t('watch.validate.onTime');
    const where =
      sent.kind === 'ELSEWHERE'
        ? t('watch.validate.doneElsewhere', { place: sent.place })
        : t('watch.validate.doneAt', { place: current?.placeName ?? '', at: formatWhen(at.toISOString(), lang), timing });
    return sent.latitude !== undefined ? `${where} ${t('watch.validate.withPosition')}` : where;
  };

  // A next step already planned: validate, then confirm it.
  const validateNow = (extraFields: Partial<ValidateInput> = {}) =>
    void action.run(async () => {
      const sent = { ...(await payload()), ...extraFields };
      await validateWatch(watch.id, sent);
      if (sent.endTrip) {
        navigate('/watch', { state: { ended: watch.label } });
        return;
      }
      setDone({ text: doneText(sent, new Date()) });
      // A next step planned right here needs no second confirmation.
      if (sent.nextStep) setNextOk(true);
      await reload();
    });

  // The last step: end the trip — with its people's fate chosen first.
  const endHere = () =>
    void action.run(async () => {
      const sent = await payload();
      const people = watch.travelCircles.some((c) => c.addedForTrip.some((p) => p.status === 'ACCEPTED'));
      if (people) {
        navigate(`/watch/${watch.id}/end`, { state: { validation: sent } });
        return;
      }
      await validateWatch(watch.id, { ...sent, endTrip: true });
      navigate('/watch', { state: { ended: watch.label } });
    });

  if (!current && !done) {
    return (
      <div className="watch-page">
        <Link to={`/watch/${watch.id}`} className="back-link">
          ‹ {watch.label}
        </Link>
        <p>{t('watch.validate.nothing')}</p>
      </div>
    );
  }

  const elsewhereMissing = kind === 'ELSEWHERE' && !place.trim();

  return (
    <div className="watch-page">
      <Link to={`/watch/${watch.id}`} className="back-link">
        ‹ {watch.label}
      </Link>

      {!done && current && (
        <>
          <h1>{t('watch.validate.title', { n: index, place: current.placeName ?? '' })}</h1>
          <p>
            {t('watch.validate.planned', {
              at: formatWhen(current.expectedAt, lang),
              alertAt: formatWhen(current.alertAt, lang),
            })}
          </p>
          {current.missedAt && <p className="form-error">{t('watch.validate.alertRunning')}</p>}

          <div className="watch-status-card">
            <button
              type="button"
              className="choice-card"
              aria-pressed={kind === 'AS_PLANNED'}
              onClick={() => setKind('AS_PLANNED')}
            >
              <strong>{t('watch.validate.asPlanned')}</strong>
            </button>
            <button
              type="button"
              className="choice-card"
              aria-pressed={kind === 'ELSEWHERE'}
              onClick={() => setKind('ELSEWHERE')}
            >
              <strong>{t('watch.validate.elsewhere')}</strong>
            </button>
          </div>
          {kind === 'ELSEWHERE' && (
            <label>
              {t('watch.validate.where')} *
              <input
                type="text"
                required
                maxLength={191}
                value={place}
                placeholder={t('watch.validate.wherePlaceholder')}
                onChange={(e) => setPlace(e.target.value)}
              />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={withPosition} onChange={(e) => setWithPosition(e.target.checked)} />
            {t('watch.validate.sharePosition')}
          </label>
          {locateError && <p className="form-hint">{t(`alerts.location.${locateError}`)}</p>}
          <label>
            {t('watch.validate.logbook')}
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              placeholder={t('watch.validate.logbookPlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {action.error && <p className="form-error">{action.error}</p>}

          {ahead.length > 0 ? (
            <button
              type="button"
              className="watch-primary"
              disabled={action.busy || locating || elsewhereMissing}
              onClick={() => validateNow()}
            >
              {t('watch.validate.submit')}
            </button>
          ) : (
            <>
              <section className="watch-section">
                <h2>{t('watch.validate.planNext')} *</h2>
                <StepFields value={nextDraft} onChange={setNextDraft} />
                <button
                  type="button"
                  className="watch-primary"
                  disabled={action.busy || locating || elsewhereMissing || !stepReady(nextDraft)}
                  onClick={() => validateNow({ nextStep: stepInput({ ...nextDraft, delayMinutes: tripDelay(watch) }) })}
                >
                  {t('watch.validate.submitWithNext')}
                </button>
              </section>
              <button
                type="button"
                className="watch-outline"
                disabled={action.busy || locating || elsewhereMissing}
                onClick={endHere}
              >
                {t('watch.validate.lastStep')}
              </button>
            </>
          )}
        </>
      )}

      {done && (
        <>
          <div className="watch-done">
            <strong>{t('watch.validate.done')}</strong>
            <span>{done.text}</span>
          </div>
          <NextStepConfirm
            watch={watch}
            confirmed={nextOk}
            onConfirm={() => setNextOk(true)}
            adding={adding}
            onAdd={() => setAdding(true)}
          />
          {adding && (
            <section className="watch-section">
              <h2>{t('watch.steps.add')}</h2>
              <StepFields value={extra} onChange={setExtra} />
              <button
                type="button"
                disabled={action.busy || !stepReady(extra)}
                onClick={() =>
                  void action.run(async () => {
                    await addStep(watch.id, stepInput({ ...extra, delayMinutes: tripDelay(watch) }));
                    setAdding(false);
                    setExtra(emptyStep());
                    await reload();
                  })
                }
              >
                {t('watch.steps.addConfirm')}
              </button>
            </section>
          )}
          {action.error && <p className="form-error">{action.error}</p>}
          <button
            type="button"
            className="watch-primary"
            disabled={!nextOk && stepsAhead(watch).length > 0}
            onClick={() => navigate(`/watch/${watch.id}`)}
          >
            {nextOk || stepsAhead(watch).length === 0 ? t('watch.validate.finish') : t('watch.validate.confirmFirst')}
          </button>
        </>
      )}

      {logbook.length > 0 && (
        <section className="watch-logbook">
          <h2>{t('watch.logbook.title')}</h2>
          {logbook.map((c) => (
            <article key={c.id}>
              <small>
                {t('watch.logbook.entry', {
                  n: watch.checkpoints.indexOf(c) + 1,
                  at: formatWhen(c.validatedAt!, lang),
                  planned: formatWhen(c.expectedAt, lang),
                  place: c.validatedPlace ?? c.placeName ?? '',
                })}
              </small>
              {c.validatedNote && <span>{c.validatedNote}</span>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

// "Votre prochaine étape est-elle toujours bonne ?" — required: the 1st
// circle counts on it.
function NextStepConfirm({
  watch,
  confirmed,
  onConfirm,
  adding,
  onAdd,
}: {
  watch: Watch;
  confirmed: boolean;
  onConfirm: () => void;
  adding: boolean;
  onAdd: () => void;
}) {
  const { t, i18n } = useTranslation();
  const next = watch.checkpoints.find((c) => c.id === watch.currentCheckpointId);
  if (!next) return null;
  return (
    <section className="watch-section">
      <h2>{t('watch.validate.nextStillGood')} *</h2>
      <div className="watch-person-row">
        <span>
          <strong>{next.placeName}</strong>
          <small className="form-hint">
            {' '}
            {formatWhen(next.expectedAt, i18n.language)} ·{' '}
            {t('watch.steps.alertIfNothing', { at: formatWhen(next.alertAt, i18n.language) })}
          </small>
        </span>
        <span className="row">
          <button type="button" disabled={confirmed} onClick={onConfirm}>
            {confirmed ? t('watch.validate.confirmed') : t('watch.validate.stillGood')}
          </button>
          <Link to={`/watch/${watch.id}`}>{t('common.edit')}</Link>
        </span>
      </div>
      {!adding && (
        <button type="button" className="watch-add" onClick={onAdd}>
          + {t('watch.validate.addAnother')}
        </button>
      )}
    </section>
  );
}
