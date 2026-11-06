import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlertStatus } from '../api/alert';
import { Modal } from './Modal';

// Guidance at the top of an alert page, so someone under stress knows
// right away what is theirs to do: a welcome pop-up the first time they
// open the alert in a given role, a "Your role" banner with their steps,
// and where the alert stands (launched → 1st circle → wider search →
// over).

export type GuideRole = 'activeLead' | 'lead' | 'firstCircle' | 'companion' | 'asked';

// Where the alert stands, from its status: SENT/LAUNCHED = the 1st circle
// was told, ACTIVE = other circles asked, RESOLVED = over. (CLOSING is no
// longer used: an alert simply ends, with a closing word.)
const STAGE: Record<AlertStatus, number> = {
  SENT: 1,
  LAUNCHED: 1,
  ACTIVE: 2,
  CLOSING: 2,
  RESOLVED: 3,
};

export function AlertSteps({ status }: { status: AlertStatus }) {
  const { t } = useTranslation();
  const labels = t('alerts.guide.steps', { returnObjects: true }) as string[];
  const now = STAGE[status];
  return (
    <ol className="alert-steps" aria-label={t('alerts.guide.stepsLabel')}>
      {labels.map((label, i) => (
        <li
          key={label}
          className={i < now || status === 'RESOLVED' ? 'done' : i === now ? 'now' : undefined}
          aria-current={i === now ? 'step' : undefined}
        >
          <i aria-hidden="true" />
          {label}
        </li>
      ))}
    </ol>
  );
}

// `vars`: name (the person the alert is about), lead (the responsible
// Lead).
// context: 'female' / 'male' picks the gendered text variant (gender.ts).
type GuideVars = { name: string; lead: string; context?: 'female' | 'male' | 'neutral' };

export function RoleBanner({ role, vars }: { role: GuideRole; vars: GuideVars }) {
  const { t } = useTranslation();
  const todo = t(`alerts.guide.roles.${role}.todo`, {
    ...vars,
    returnObjects: true,
  }) as string[];
  // Only the role line shows; its steps open on a tap (the alert page
  // has a lot to read).
  return (
    <details className="role-banner">
      <summary>
        <strong>{t(`alerts.guide.roles.${role}.banner`, vars)}</strong>
      </summary>
      <ol>
        {todo.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </details>
  );
}

// Shown once per alert and role: coming back to the same alert in the same
// role doesn't show it again, but a new role does (e.g. becoming the
// responsible Lead, or the person being found). Remembered in this
// browser only — losing it just means seeing the pop-up once more.
export function WelcomeModal({ alertId, role, vars }: { alertId: string; role: GuideRole; vars: GuideVars }) {
  const { t } = useTranslation();
  const key = `alert-welcome:${alertId}:${role}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === null;
    } catch {
      return true;
    }
  });
  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // Storage unavailable: the pop-up will just show again next time.
    }
    setOpen(false);
  };
  const title = t(`alerts.guide.roles.${role}.title`, vars);
  const items = t(`alerts.guide.roles.${role}.welcome`, {
    ...vars,
    returnObjects: true,
  }) as string[];

  return (
    <Modal title={title} onClose={close}>
      <div className="welcome-modal">
        <span className="welcome-tag">{t(`alerts.guide.roles.${role}.tag`, vars)}</span>
        <ol>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <button className="danger" onClick={close}>
          {t('alerts.guide.gotIt')}
        </button>
      </div>
    </Modal>
  );
}
