import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { addSubscriptionYear, type Plan } from '../api/user';
import type { UpgradeReason } from '../plan';
import { Modal } from './Modal';
import { genderContext, type Gender } from '../gender';
import { STAR } from './SubscribedStar';
import { useAction } from '../useAction';

// Shown where a paid feature is reached on a free account: what's missing
// and a link to the Plans page.
export function UpgradeNotice({ reason }: { reason: UpgradeReason }) {
  const { t } = useTranslation();
  return (
    <div className="upgrade-notice">
      <p>{t(`plans.locked.${reason}`)}</p>
      <Link to="/plans" className="button-link">
        {t('plans.seePlans')}
      </Link>
    </div>
  );
}

// The free alert is used and there's no subscription: the person raising
// chooses to give (or take) a year of subscription, or to pay for this one
// alert. name = the companion's first name, null when it's for myself.
export function PayForAlertChoice({
  plan,
  name,
  gender,
  submitting,
  onRaise,
}: {
  plan: Plan | null;
  name: string | null;
  gender?: Gender | null;
  submitting: boolean;
  onRaise: (how: 'year' | 'single') => void;
}) {
  const { t } = useTranslation();
  const canPay = !!plan?.paymentAvailable;
  const who = name === null ? 'self' : 'other';
  return (
    <div className="upgrade-notice pay-choice">
      <p>{t(`plans.payAlert.${who}.intro`, { name, context: genderContext(gender) })}</p>
      <button type="button" className="alert-btn" disabled={!canPay || submitting} onClick={() => onRaise('year')}>
        {t(`plans.payAlert.${who}.year`, { name })}
      </button>
      <button type="button" disabled={!canPay || submitting} onClick={() => onRaise('single')}>
        {t('plans.payAlert.single')}
      </button>
      {!canPay && <p className="form-hint">{t('plans.paymentSoon')}</p>}
      <Link to="/plans">{t('plans.seePlans')}</Link>
    </div>
  );
}

// The same gold star as on a subscriber's name: it always means
// "subscription".
function PaidStarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

export type PaidFeature = UpgradeReason | 'travel';

// A gold star next to a paid feature on a free account (never a lock).
// Hover: what it is; click: a small window saying it comes with the
// subscription, with the Plans link. `chip` = a plain star, for spots
// already inside a button (Settings tiles).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PaidPill({ feature: _feature, chip }: { feature: PaidFeature; chip?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (chip) {
    return (
      <span className="paid-star" role="img" aria-label={t('plans.pill.label')}>
        <PaidStarIcon />
      </span>
    );
  }
  const openModal = (e: MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  };
  return (
    <span className="paid-pill-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="paid-star"
        aria-label={t('plans.pill.label')}
        onClick={openModal}
      >
        <PaidStarIcon />
      </button>
      {open &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()}>
            <SubscriptionModal onClose={() => setOpen(false)} />
          </span>,
          document.body,
        )}
    </span>
  );
}

export function SubscriptionModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('plans.pill.modalTitle')} onClose={onClose}>
      <Link to="/plans" className="button-link" onClick={onClose}>
        {t('plans.seePlans')}
      </Link>
    </Modal>
  );
}

// On a companion's card (My Companions): their free alert is used and they
// have no subscription — offer them a year now, before an emergency.
// Safe inside the card's link: clicks never reach it.
export function GiftYearButton({
  userId,
  name,
  gender,
  plan,
  onDone,
}: {
  userId: string;
  name: string;
  gender?: Gender | null;
  plan: Plan | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction();

  const gift = () =>
    run(async () => {
      await addSubscriptionYear(userId);
      setOpen(false);
      onDone();
    });

  return (
    <span className="gift-year-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="gift-year"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {t('plans.gift.button', { name })}
      </button>
      {open &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()}>
            <Modal title={t('plans.gift.title', { name })} onClose={() => setOpen(false)}>
              <p>{t('plans.gift.text', { name, context: genderContext(gender) })}</p>
              {error && <p className="form-error">{error}</p>}
              <div className="row">
                <button type="button" disabled={!plan?.paymentAvailable || busy} onClick={() => void gift()}>
                  {t('plans.gift.confirm')}
                </button>
                <Link to="/plans" onClick={() => setOpen(false)}>
                  {t('plans.seePlans')}
                </Link>
              </div>
              {!plan?.paymentAvailable && <p className="form-hint">{t('plans.paymentSoon')}</p>}
            </Modal>
          </span>,
          document.body,
        )}
    </span>
  );
}
