import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSecurityScore, type SecurityScore } from '../api/sentinel';

// `refreshKey` changes when the page's circles reload, so the bar follows.
export function SecurityScoreBar({ refreshKey }: { refreshKey?: number }) {
  const { t } = useTranslation();
  const [security, setSecurity] = useState<SecurityScore | null>(null);

  useEffect(() => {
    getSecurityScore()
      .then(setSecurity)
      .catch(() => setSecurity(null));
  }, [refreshKey]);

  if (!security) return null;

  return (
    <div className="security-score">
      <div
        className="security-score-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={security.score}
        aria-label={t('securityScore.title')}
      >
        <div
          className={`security-score-fill${security.ready ? ' is-ready' : ''}`}
          style={{ width: `${security.score}%` }}
        />
        <div className="security-score-minimum" />
      </div>
      <p className="security-score-label">
        <strong>{security.score} %</strong> — {t(`securityScore.levels.${security.level}`)}
      </p>
      {security.missing.length > 0 && (
        <ul className="security-score-missing">
          {security.missing.map((item) => (
            <li key={item}>{t(`securityScore.missing.${item}`)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
