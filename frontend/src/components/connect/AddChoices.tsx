import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCircles } from '../../api/sentinel';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';

// After finding someone (QR code or number): "X veille sur moi" (into one
// of my circles) and / or "Je veille sur X". Each sends a request the other
// person accepts.
export function AddChoices({
  name,
  onInvite,
  onRequest,
}: {
  name: string;
  onInvite: (circleId: string) => Promise<unknown>;
  onRequest: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { data: circles = [] } = useLoad(listCircles);
  const assignable = circles.filter((c) => c.circleType !== 'RESERVED' && !(c.trip && !c.trip.closedAt));
  const [watchesMe, setWatchesMe] = useState(false);
  const [iWatch, setIWatch] = useState(false);
  const [circleId, setCircleId] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const target = circleId || assignable[0]?.id || '';

  if (sent) return <p className="watch-done">{t('connect.sent', { name })}</p>;

  return (
    <div className="connect-choices">
      <label className="check">
        <input type="checkbox" checked={watchesMe} onChange={(e) => setWatchesMe(e.target.checked)} />
        {t('connect.watchesMe', { name })}
      </label>
      {watchesMe && (
        <label>
          {t('connect.inCircle')}
          <select value={target} onChange={(e) => setCircleId(e.target.value)}>
            {assignable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={iWatch} onChange={(e) => setIWatch(e.target.checked)} />
        {t('connect.iWatch', { name })}
      </label>
      {error && <p className="form-error">{error}</p>}
      <button
        type="button"
        disabled={busy || (!watchesMe && !iWatch) || (watchesMe && !target)}
        onClick={() =>
          void run(async () => {
            if (watchesMe) await onInvite(target);
            if (iWatch) await onRequest();
            setSent(true);
          })
        }
      >
        {t('connect.send')}
      </button>
    </div>
  );
}
