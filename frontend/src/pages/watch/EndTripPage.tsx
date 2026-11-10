import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { endWatch, getWatch, validateWatch, type EndChoice, type EndChoices, type ValidateInput } from '../../api/watch';
import { listCircles } from '../../api/sentinel';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';
import { Loading } from '../../components/Loading';

type Bulk = Exclude<EndChoice, 'CIRCLE'>;

// End of a trip: what becomes of the people added for it — for all of
// them at once, or one by one. Existing Sentinels keep their place.
// Reached from "Terminer le voyage", or from the last step's validation
// (then carried in the route state and sent along with the end).
export function EndTripPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { watchId = '' } = useParams();
  const validation = (useLocation().state as { validation?: ValidateInput } | null)?.validation;
  const { data, loading, error } = useLoad(async () => {
    const [watch, circles] = await Promise.all([getWatch(watchId), listCircles()]);
    return { watch, circles };
  }, [watchId]);
  const [bulk, setBulk] = useState<Bulk>('RESERVE');
  // linkId -> "RESERVE" | "END" | "KEEP" | a circle id.
  const [each, setEach] = useState<Record<string, string>>({});
  const { busy, error: endError, run } = useAction();

  if (loading) return <Loading />;
  if (!data) return <p className="form-error">{error}</p>;
  const { watch, circles } = data;
  if (watch.closedAt) return <Navigate to="/watch" replace />;

  const people = watch.travelCircles.flatMap((c) =>
    c.addedForTrip.filter((p) => p.status === 'ACCEPTED').map((p) => ({ ...p, circle: c })),
  );
  const travelIds = new Set(watch.travelCircles.map((c) => c.id));
  // Not the 1st circle (that asks the Sentinel first), not the reserve,
  // not a group, not this trip's own circles.
  const otherCircles = circles.filter((c) => c.circleType === 'BASIC' && !travelIds.has(c.id));

  const choiceOf = (linkId: string, isGroup: boolean) => {
    const picked = each[linkId] ?? bulk;
    return picked === 'KEEP' && isGroup ? 'RESERVE' : picked;
  };
  const choices = (): EndChoices => ({
    forAll: bulk,
    perPerson: people
      .filter((p) => each[p.linkId] !== undefined)
      .map((p) => {
        const c = each[p.linkId];
        return ['RESERVE', 'END', 'KEEP'].includes(c)
          ? { linkId: p.linkId, choice: c as Bulk }
          : { linkId: p.linkId, choice: 'CIRCLE' as const, circleId: c };
      }),
  });
  const finish = () =>
    void run(async () => {
      if (validation) await validateWatch(watch.id, { ...validation, endTrip: true, endChoices: choices() });
      else await endWatch(watch.id, choices());
      navigate('/watch', { state: { ended: watch.label } });
    });

  const bulkOptions: [Bulk, string][] = [
    ['END', t('watch.end.endLink')],
    ['RESERVE', t('watch.end.reserve')],
    ['KEEP', t('watch.end.keep')],
  ];

  return (
    <div className="watch-page">
      <Link to={`/watch/${watch.id}`} className="back-link">
        ‹ {watch.label}
      </Link>
      <div>
        <h1>{people.length > 0 ? t('watch.end.title', { count: people.length }) : t('watch.trip.end')}</h1>
        {people.length > 0 && <p>{t('watch.end.intro')}</p>}
      </div>

      {people.length > 0 && (
        <section className="watch-section">
          <h2>{t('watch.end.forAll', { count: people.length })}</h2>
          {bulkOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="choice-card"
              aria-pressed={bulk === value}
              onClick={() => {
                setBulk(value);
                setEach({});
              }}
            >
              <strong>{label}</strong>
              {value === 'RESERVE' && <span>{t('watch.end.default')}</span>}
            </button>
          ))}

          <h2>{t('watch.end.each')}</h2>
          {people.map((p) => (
            <div key={p.linkId} className="watch-person-row">
              <span>
                <strong>{p.person.firstName}</strong> <small className="form-hint">{p.circle.label}</small>
              </span>
              <select
                aria-label={t('watch.end.whatFor', { name: p.person.firstName })}
                value={choiceOf(p.linkId, p.circle.isGroup)}
                onChange={(e) => setEach({ ...each, [p.linkId]: e.target.value })}
              >
                <option value="RESERVE">{t('watch.end.optionReserve')}</option>
                {!p.circle.isGroup && <option value="KEEP">{t('watch.end.optionKeep')}</option>}
                {otherCircles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value="END">{t('watch.end.endLink')}</option>
              </select>
            </div>
          ))}
          <p className="form-hint">{t('watch.end.groupsClose')}</p>
        </section>
      )}

      {endError && <p className="form-error">{endError}</p>}
      <button type="button" className="watch-primary" disabled={busy} onClick={finish}>
        {t('watch.end.finish')}
      </button>
    </div>
  );
}
