import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export type NudgeMoment = 'afterAlert' | 'netReady';

const storageKey = (moment: NudgeMoment) => `plan-nudge-dismissed:${moment}`;

function wasDismissed(moment: NudgeMoment): boolean {
  try {
    return localStorage.getItem(storageKey(moment)) === '1';
  } catch {
    return false;
  }
}

// A gentle "subscribe" card on the Dashboard of a free account, at the two
// moments it makes sense: after the free alert has been used, and once the
// 1st circle is ready to carry an alert. "Later" hides it for good on this
// device. Never shown during an alert (DashboardPage decides).
export function PlanNudge({ moment }: { moment: NudgeMoment | null }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<NudgeMoment[]>([]);
  if (!moment || dismissed.includes(moment) || wasDismissed(moment)) return null;

  const later = () => {
    try {
      localStorage.setItem(storageKey(moment), '1');
    } catch {
      // Private mode: hidden for this visit only.
    }
    setDismissed((d) => [...d, moment]);
  };

  return (
    <aside className="plan-nudge">
      <p>{t(`plans.nudge.${moment}`)}</p>
      <div className="row">
        <Link to="/plans" className="button-link">
          {t('plans.seePlans')}
        </Link>
        <button type="button" className="link-button" onClick={later}>
          {t('plans.nudge.later')}
        </button>
      </div>
    </aside>
  );
}
