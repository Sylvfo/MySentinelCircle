import { useTranslation } from 'react-i18next';

// Gold star on someone with a running yearly subscription (variant A,
// chosen by Sylvie 2026-11-06): an alert can always be raised for them.
// Top-right of the figure, opposite the pause badge "||" (top-left).
// Shown to the people linked to them only — they're the ones who get it.
const STAR = 'M12 1.8 L15 8.3 L22 9 L16.7 13.8 L18.2 20.8 L12 17.2 L5.8 20.8 L7.3 13.8 L2 9 L9 8.3 Z';

export function SubscribedStar({ className = '' }: { className?: string }) {
  return (
    <span className={`subscribed-star ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={STAR} />
      </svg>
    </span>
  );
}

// The same star next to a name (after it). Its side is set in index.css
// (.name-star), so moving it to the left is a one-line change.
export function NameStar({ title }: { title?: string }) {
  return (
    <span className="name-star" title={title} role={title ? 'img' : undefined} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={STAR} />
      </svg>
    </span>
  );
}

// On a feature my running subscription pays for (alerts beyond the free
// one, founding a group, the death notice…): the same gold star, so it
// always means "subscription". Subscribers only — free accounts see the
// lock pill (PaidPill) instead.
export function IncludedStar() {
  const { t } = useTranslation();
  return <NameStar title={t('plans.includedStar')} />;
}
