import { useCallback, useEffect, useState } from 'react';
import { getPlan, type Plan } from './api/user';

export type UpgradeReason = 'alerts' | 'groups' | 'deathNotice';

// My plan, loaded once per page. null while loading (or if it failed:
// the backend still enforces every rule, so nothing unsafe is shown).
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const reload = useCallback(() => {
    getPlan()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);
  useEffect(reload, [reload]);
  return { plan, reload };
}

// Backend refusals that mean "this needs paying" (backend/src/user/plan.util.ts).
const UPGRADE_ERRORS: Record<string, UpgradeReason> = {
  'Free trial alerts used up — a paid Companion account is needed to raise more': 'alerts',
  'A paid Companion account is needed to found a group circle': 'groups',
  'The death notice needs a subscription or its one-time purchase': 'deathNotice',
};

export function upgradeReasonOf(message: string | null): UpgradeReason | null {
  return (message && UPGRADE_ERRORS[message]) || null;
}
