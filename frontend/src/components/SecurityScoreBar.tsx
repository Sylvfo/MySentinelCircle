import { useEffect, useRef, useState } from 'react';
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
  const explain = !barOnly && !security.ready;

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

  if (!explain) return <div className="security-score">{track}</div>;

  return (
    <div
      ref={rootRef}
      className="security-score explainable"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="security-score-toggle"
        aria-expanded={open}
        aria-label={t('securityScore.whatsMissing')}
        onClick={() => setOpen((o) => !o)}
      >
        {track}
        <span className="security-score-help">{t('securityScore.notReadyTap')}</span>
      </button>
      {open && (
        <div className="security-score-popup" role="dialog" aria-label={t('securityScore.minimumTitle')}>
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
