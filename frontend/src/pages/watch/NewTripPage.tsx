import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { createTrip, TRIP_DELAYS } from '../../api/watch';
import { useAction } from '../../useAction';
import { upgradeReasonOf } from '../../plan';
import { UpgradeNotice } from '../../components/Upgrade';
import { DelaySelect, StepFields } from '../../components/watch/WatchParts';
import { emptyStep, stepInput, stepReady, type StepDraft } from '../../components/watch/watchFormat';

// A name, the delay before the alert (for the whole trip), its steps, what
// to do if the alert goes off; the trip's own circle if asked.
export function NewTripPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  // Each step keeps its own key: removing one never mixes up the others.
  const [steps, setSteps] = useState<(StepDraft & { key: number })[]>([{ ...emptyStep(), key: 0 }]);
  const [instructions, setInstructions] = useState('');
  const [travelCircle, setTravelCircle] = useState(false);
  // The 1st circle sees the whole trip, or nothing of it until an alert.
  const [shared, setShared] = useState(false);
  // For the whole trip: every step gets it.
  const [delay, setDelay] = useState(120);
  const { busy, error, run } = useAction();
  const upgrade = upgradeReasonOf(error);

  const setStep = (i: number, step: StepDraft) => setSteps(steps.map((s, j) => (j === i ? { ...step, key: s.key } : s)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const [first, ...more] = steps.map((s) => stepInput({ ...s, delayMinutes: delay }));
      const trip = await createTrip({
        name: name.trim(),
        instructions: instructions.trim() || undefined,
        firstStep: first,
        ...(more.length ? { moreSteps: more } : {}),
        travelCircle,
        shareItineraryWithFirstCircle: shared,
        shareValidationsWithFirstCircle: shared,
      });
      navigate(`/watch/${trip.id}`, { replace: true });
    });
  };

  return (
    <form className="watch-page" onSubmit={submit}>
      <Link to="/watch" className="back-link">
        ‹ {t('watch.title')}
      </Link>
      <h1>{t('watch.newTrip.title')}</h1>

      <label>
        {t('watch.newTrip.name')} *
        <input
          type="text"
          required
          maxLength={100}
          value={name}
          placeholder={t('watch.newTrip.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <DelaySelect label={t('watch.step.alertAfter')} value={delay} options={TRIP_DELAYS} onChange={setDelay} />
      <label>
        {t('watch.instructions.label')}
        <textarea
          rows={3}
          maxLength={2000}
          value={instructions}
          placeholder={t('watch.instructions.tripPlaceholder')}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={travelCircle} onChange={(e) => setTravelCircle(e.target.checked)} />
        {t('watch.newTrip.withCircle')}
      </label>
      <label className="check">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        {t('watch.see.shareTrip')}
      </label>

      <section className="watch-section">
        <h2>{t('watch.steps.title')}</h2>
        {steps.map((step, i) => (
          <div key={step.key} className={i > 0 ? 'watch-step-draft' : undefined}>
            <div className="watch-person-row">
              <strong>{i === 0 ? t('watch.newTrip.firstStep') : t('watch.newTrip.stepN', { n: i + 1 })}</strong>
              {i > 0 && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                >
                  {t('common.remove')}
                </button>
              )}
            </div>
            <StepFields value={step} onChange={(s) => setStep(i, s)} />
          </div>
        ))}
        <button
          type="button"
          className="watch-add"
          onClick={() => {
            const last = steps.at(-1)!;
            setSteps([...steps, { ...emptyStep(), key: last.key + 1 }]);
          }}
        >
          + {t('watch.steps.add')}
        </button>
      </section>



      {upgrade ? <UpgradeNotice reason={upgrade} /> : error && <p className="form-error">{error}</p>}

      <button type="submit" className="watch-primary" disabled={busy || !name.trim() || !steps.every(stepReady)}>
        {t('watch.newTrip.start')}
      </button>
    </form>
  );
}
