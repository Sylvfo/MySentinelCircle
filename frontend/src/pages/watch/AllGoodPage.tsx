import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  ALL_GOOD_DELAYS,
  endWatch,
  listMyWatches,
  startAllGood,
  updateWatch,
  validateWatch,
  type CheckInSchedule,
  type Watch,
} from '../../api/watch';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';
import { upgradeReasonOf } from '../../plan';
import { Loading } from '../../components/Loading';
import { ConfirmModal } from '../../components/Modal';
import { UpgradeNotice } from '../../components/Upgrade';
import { DelaySelect, Switch } from '../../components/watch/WatchParts';
import { delayOf, formatWhen } from '../../components/watch/watchFormat';

type Rhythm = 'DAILY' | 'WEEKDAYS' | 'EVERY';
const WEEK = [1, 2, 3, 4, 5, 6, 7];
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

// Check tout va bien: settings and, once on, the "Tout va bien ✓" button.
export function AllGoodPage() {
  const { t } = useTranslation();
  const { data: watches, loading, error, reload } = useLoad(listMyWatches);
  if (loading) return <Loading />;
  if (!watches) return <p className="form-error">{error}</p>;
  const watch = watches.find((w) => w.mode === 'ALL_GOOD') ?? null;
  return (
    <div className="watch-page">
      <Link to="/watch" className="back-link">
        ‹ {t('watch.title')}
      </Link>
      <h1>{t('watch.allGood.title')}</h1>
      {watch && <AllGoodStatus watch={watch} onChanged={reload} />}
      <AllGoodSettings key={watch?.id ?? 'new'} watch={watch} onChanged={reload} />
    </div>
  );
}

function AllGoodStatus({ watch, onChanged }: { watch: Watch; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const { busy, error, run } = useAction();
  const pending = watch.checkpoints.find((c) => c.id === watch.currentCheckpointId);
  const last = watch.checkpoints
    .filter((c) => c.validatedAt)
    .sort((a, b) => b.validatedAt!.localeCompare(a.validatedAt!))[0];
  return (
    <section className="watch-section">
      {watch.pausedBecause ? (
        <p>
          <strong>{t(`watch.pill.paused.${watch.pausedBecause}`)}</strong>
        </p>
      ) : (
        pending && (
          <p>
            <strong>{t('watch.allGood.on')}</strong> ·{' '}
            {t('watch.allGood.nextBefore', { at: formatWhen(pending.expectedAt, i18n.language) })}
          </p>
        )
      )}
      <p className="form-hint">
        {last
          ? t('watch.allGood.lastValidation', { at: formatWhen(last.validatedAt!, i18n.language) })
          : t('watch.allGood.noValidationYet')}
      </p>
      <button
        type="button"
        className="watch-primary"
        disabled={busy || !pending}
        onClick={() =>
          void run(async () => {
            await validateWatch(watch.id, {});
            await onChanged();
          })
        }
      >
        {t('watch.allGood.allGood')}
      </button>
      <p className="form-hint">{t('watch.allGood.early')}</p>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function AllGoodSettings({ watch, onChanged }: { watch: Watch | null; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const initial = watch?.schedule;
  const pending = watch?.checkpoints.find((c) => c.id === watch.currentCheckpointId);
  const [rhythm, setRhythm] = useState<Rhythm>(initial?.kind ?? 'DAILY');
  const [days, setDays] = useState<number[]>(initial?.kind === 'WEEKDAYS' ? initial.days : [1, 2, 3, 4, 5]);
  const [every, setEvery] = useState(initial?.kind === 'EVERY' ? initial.every : 1);
  const [unit, setUnit] = useState<'DAY' | 'WEEK' | 'MONTH'>(initial?.kind === 'EVERY' ? initial.unit : 'WEEK');
  const [from, setFrom] = useState(initial?.kind === 'EVERY' ? initial.from : today());
  const [before, setBefore] = useState(initial?.before ?? '10:00');
  const [delay, setDelay] = useState(pending ? delayOf(pending) : 240);
  const [instructions, setInstructions] = useState(watch?.messageAlert ?? '');
  const [itinerary, setItinerary] = useState(watch?.shareItineraryWithFirstCircle ?? false);
  const [validations, setValidations] = useState(watch?.shareValidationsWithFirstCircle ?? false);
  const [pauseUntil, setPauseUntil] = useState('');
  const [pausing, setPausing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const upgrade = upgradeReasonOf(error);

  const schedule = (): CheckInSchedule =>
    rhythm === 'WEEKDAYS'
      ? { kind: 'WEEKDAYS', days, before }
      : rhythm === 'EVERY'
        ? { kind: 'EVERY', every, unit, from, before }
        : { kind: 'DAILY', before };
  const scheduleChanged = JSON.stringify(schedule()) !== JSON.stringify(watch?.schedule ?? null);

  const save = () =>
    void run(async () => {
      const sharing = { shareItineraryWithFirstCircle: itinerary, shareValidationsWithFirstCircle: validations };
      if (watch) {
        await updateWatch(watch.id, {
          ...sharing,
          instructions: instructions.trim(),
          ...(scheduleChanged ? { schedule: schedule() } : {}),
          ...(pending && delay !== delayOf(pending) ? { delayMinutes: delay } : {}),
        });
      } else {
        await startAllGood({
          ...sharing,
          schedule: schedule(),
          delayMinutes: delay,
          instructions: instructions.trim() || undefined,
        });
      }
      setSaved(true);
      await onChanged();
    });
  const setPause = (until: string | null) =>
    void run(async () => {
      await updateWatch(watch!.id, { pausedUntil: until });
      setPausing(false);
      await onChanged();
    });

  const rhythms: [Rhythm, string][] = [
    ['DAILY', t('watch.allGood.rhythm.daily')],
    ['WEEKDAYS', t('watch.allGood.rhythm.weekdays')],
    ['EVERY', t('watch.allGood.rhythm.every')],
  ];
  const manuallyPaused = watch?.pausedUntil && new Date(watch.pausedUntil) > new Date();

  return (
    <>
      <section className="watch-section">
        <h2>{t('watch.allGood.when')}</h2>
        <fieldset className="chip-row">
          <legend className="form-hint">{t('watch.allGood.rhythm.legend')}</legend>
          {rhythms.map(([r, label]) => (
            <button key={r} type="button" className="chip-choice" aria-pressed={rhythm === r} onClick={() => setRhythm(r)}>
              {label}
            </button>
          ))}
        </fieldset>
        {rhythm === 'WEEKDAYS' && (
          <div className="chip-row">
            {WEEK.map((d) => (
              <button
                key={d}
                type="button"
                className="chip-choice day"
                aria-pressed={days.includes(d)}
                aria-label={t(`watch.allGood.days.${d}`)}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
              >
                {t(`watch.allGood.daysShort.${d}`)}
              </button>
            ))}
          </div>
        )}
        {rhythm === 'EVERY' && (
          <div className="watch-grid-2">
            <label>
              {t('watch.allGood.everyLabel')}
              <span className="row">
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={every}
                  aria-label={t('watch.allGood.howMany')}
                  onChange={(e) => setEvery(Math.max(1, Number(e.target.value)))}
                />
                <select value={unit} aria-label={t('watch.allGood.unit')} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                  <option value="DAY">{t('watch.allGood.units.DAY')}</option>
                  <option value="WEEK">{t('watch.allGood.units.WEEK')}</option>
                  <option value="MONTH">{t('watch.allGood.units.MONTH')}</option>
                </select>
              </span>
            </label>
            <label>
              {t('watch.allGood.from')}
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
          </div>
        )}
        <label>
          {t('watch.allGood.before')}
          <input type="time" value={before} onChange={(e) => setBefore(e.target.value)} />
        </label>
        <DelaySelect label={t('watch.allGood.delay')} value={delay} options={ALL_GOOD_DELAYS} onChange={setDelay} />
      </section>

      <label>
        {t('watch.instructions.label')}
        <textarea
          rows={4}
          maxLength={2000}
          value={instructions}
          placeholder={t('watch.instructions.allGoodPlaceholder')}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>

      {watch && (
        <section className="watch-section">
          <h2>{t('watch.allGood.pause')}</h2>
          {manuallyPaused ? (
            <>
              <p>{t('watch.allGood.pausedUntil', { at: formatWhen(watch.pausedUntil!, i18n.language) })}</p>
              <button type="button" className="watch-outline" disabled={busy} onClick={() => setPause(null)}>
                {t('watch.allGood.resume')}
              </button>
            </>
          ) : pausing ? (
            <div className="row">
              <input
                type="date"
                min={today()}
                aria-label={t('watch.allGood.pauseUntil')}
                value={pauseUntil}
                onChange={(e) => setPauseUntil(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !pauseUntil}
                onClick={() => setPause(new Date(`${pauseUntil}T23:59`).toISOString())}
              >
                {t('watch.allGood.pauseConfirm')}
              </button>
            </div>
          ) : (
            <button type="button" className="watch-outline" onClick={() => setPausing(true)}>
              {t('watch.allGood.pauseUntil')}…
            </button>
          )}
          <p className="form-hint">{t('watch.allGood.tripPause')}</p>
        </section>
      )}

      <section className="watch-section">
        <h2>{t('watch.allGood.firstCircle')}</h2>
        <Switch label={t('watch.allGood.toggleKnown')} on={itinerary} onChange={setItinerary} />
        <Switch label={t('watch.allGood.toggleLast')} on={validations} onChange={setValidations} />
      </section>

      {upgrade ? <UpgradeNotice reason={upgrade} /> : error && <p className="form-error">{error}</p>}
      {saved && !error && <p className="watch-done">{t('watch.allGood.saved')}</p>}
      <button
        type="button"
        className="watch-primary"
        disabled={busy || (rhythm === 'WEEKDAYS' && days.length === 0) || !before}
        onClick={save}
      >
        {watch ? t('common.save') : t('watch.allGood.start')}
      </button>
      {watch && (
        <button type="button" className="watch-danger" onClick={() => setStopping(true)}>
          {t('watch.allGood.stop')}
        </button>
      )}
      {stopping && watch && (
        <ConfirmModal
          message={t('watch.allGood.stopConfirm')}
          confirmLabel={t('watch.allGood.stop')}
          onCancel={() => setStopping(false)}
          onConfirm={() =>
            void run(async () => {
              await endWatch(watch.id);
                navigate('/watch');
            })
          }
        />
      )}
    </>
  );
}
