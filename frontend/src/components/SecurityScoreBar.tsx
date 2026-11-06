import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getSecurityScore, type SecurityScore } from '../api/sentinel';

const REQUIREMENTS = ['phone', 'lead', 'sentinel'] as const;

// `refreshKey` changes when the page's circles reload, so the bar follows.
// `barOnly` drops the explanation (Dashboard tile, which is itself a link).
// While the net isn't ready (grey bar), hovering or tapping the bar opens a
// small window listing the minimum it takes, each ticked or not.
export function SecurityScoreBar({ refreshKey, barOnly }: { refreshKey?: number; barOnly?: boolean }) {
  const { t } = useTranslation();
  const [security, setSecurity] = useState<SecurityScore | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSecurityScore()
      .then(setSecurity)
      .catch(() => setSecurity(null));
  }, [refreshKey]);

  // Tap outside closes it (phones have no "hover out").
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  if (!security) return null;
  // Not ready: the red notice explains itself everywhere (Dashboard too).
  const explain = !security.ready;

  const track = (
    <div
      className="security-score-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={security.score}
      aria-label={t('securityScore.title')}
    >
      <div className={`security-score-fill${security.ready ? ' is-ready' : ''}`} style={{ width: `${security.score}%` }} />
      <div className="security-score-minimum" />
    </div>
  );

  // Not ready: nobody can raise an alert for me — said big and red, so it
  // can't be missed (Dashboard and My Circles alike).
  const notice = (
    <span className="security-score-alarm" role="alert">
      <strong>⚠ {t('securityScore.notProtected')}</strong>
      <span>{t('securityScore.tapToSee')}</span>
    </span>
  );

  if (!explain) return <div className={`security-score${barOnly ? ' bar-only' : ''}`}>{track}</div>;

  // Inside the Dashboard tile (a link to My Circles): a tap on the notice
  // or the popup explains, it doesn't navigate away.
  const stay = (e: MouseEvent | ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      className="security-score explainable"
      // Hover opens it with a mouse only: on a phone a tap would fire
      // "enter" then "click" and close it straight away — a tap toggles.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        className="security-score-toggle"
        aria-expanded={open}
        aria-label={t('securityScore.whatsMissing')}
        onClick={(e) => {
          stay(e);
          setOpen((o) => !o);
        }}
      >
        {track}
        {notice}
      </button>
      {open && (
        <div className="security-score-popup" onClick={stay} role="dialog" aria-label={t('securityScore.minimumTitle')}>
          <strong>{t('securityScore.minimumTitle')}</strong>
          <ul>
            {REQUIREMENTS.map((r) => {
              const done = !security.missing.includes(r);
              return (
                <li key={r} className={done ? 'done' : 'todo'}>
                  <span aria-hidden="true">{done ? '✓' : '✗'}</span> {t(`securityScore.minimum.${r}`)}
                </li>
              );
            })}
          </ul>
          <p>{t('securityScore.minimumWhy')}</p>
        </div>
      )}
    </div>
  );
}
