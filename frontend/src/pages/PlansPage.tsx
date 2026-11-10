import { useTranslation } from 'react-i18next';
import { addSubscriptionYear } from '../api/user';
import { Tile } from '../components/Tile';
import { usePlan } from '../plan';
import { IncludedStar } from '../components/SubscribedStar';
import { useAction } from '../useAction';

// Free vs paid for private users (organisations come later). The lists
// must match what the backend actually enforces (backend/src/user/
// plan.util.ts); "soon" marks what isn't built yet.
const FREE = ['sentinel', 'firstCircle', 'messages', 'trial'] as const;
const PAID = ['alerts', 'groups', 'deathNotice', 'travel', 'noAds'] as const;

export function PlansPage() {
  const { t, i18n } = useTranslation();
  const { plan, reload } = usePlan();
  const current = plan?.hasPaid ? 'paid' : 'free';
  const { busy, error, run } = useAction();
  const until = plan?.paidUntil ? new Date(plan.paidUntil).toLocaleDateString(i18n.language) : null;

  const subscribe = () =>
    run(async () => {
      await addSubscriptionYear();
      reload();
    });

  return (
    <div className="plans-page">
      <h1>{t('plans.title')}</h1>
      <p className="muted">{t('plans.intro')}</p>
      {plan && !plan.hasPaid && plan.freeAlertsLeft !== null && (
        <p className="plans-usage">{t('plans.alertsLeft', { count: plan.freeAlertsLeft, limit: plan.freeAlertLimit })}</p>
      )}

      <div className="plans-grid">
        <Tile className={`plan-card${current === 'free' ? ' plan-current' : ''}`} title={t('plans.free.title')}>
          <p className="plan-price">{t('plans.free.price')}</p>
          <ul>
            {FREE.map((k) => (
              <li key={k}>{t(`plans.free.items.${k}`, { count: plan?.freeAlertLimit ?? 1 })}</li>
            ))}
          </ul>
          {current === 'free' && <p className="plan-badge">{t('plans.current')}</p>}
        </Tile>

        <Tile className={`plan-card plan-paid${current === 'paid' ? ' plan-current' : ''}`} title={t('plans.paid.title')}>
          <p className="plan-price">{t('plans.paid.price')}</p>
          <ul>
            {PAID.map((k) => (
              <li key={k}>
                {/* Subscribed: a star on what I already have. */}
                {current === 'paid' && <IncludedStar />} {t(`plans.paid.items.${k}`)}
              </li>
            ))}
          </ul>
          {current === 'paid' && (
            <p className="form-hint">
              <IncludedStar /> {t('plans.starLegend')}
            </p>
          )}
          {current === 'paid' && (
            <p className="plan-badge">
              {t('plans.current')} — {t('plans.paid.until', { date: until })}
            </p>
          )}
          {current === 'free' && until && <p className="form-hint">{t('plans.paid.ended', { date: until })}</p>}
          <button type="button" disabled={!plan?.paymentAvailable || busy} onClick={() => void subscribe()}>
            {t(current === 'paid' ? 'plans.paid.renew' : 'plans.paid.subscribe')}
          </button>
          {!plan?.paymentAvailable && <p className="form-hint">{t('plans.paymentSoon')}</p>}
          {error && <p className="form-error">{error}</p>}
          <p className="form-hint">{t('plans.paid.gift')}</p>
        </Tile>

        <Tile className={`plan-card${plan?.deathNoticePurchased ? ' plan-current' : ''}`} title={t('plans.deathNotice.title')}>
          <p className="plan-price">{t('plans.deathNotice.price')}</p>
          <p>{t('plans.deathNotice.text')}</p>
          {plan?.deathNotice ? (
            <p className="plan-badge">{t(plan.hasPaid ? 'plans.deathNotice.included' : 'plans.deathNotice.owned')}</p>
          ) : (
            <>
              <button type="button" disabled>
                {t('plans.deathNotice.buy')}
              </button>
              <p className="form-hint">{t('plans.paymentSoon')}</p>
            </>
          )}
        </Tile>
      </div>
    </div>
  );
}
