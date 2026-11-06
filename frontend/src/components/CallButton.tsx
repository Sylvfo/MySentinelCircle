import { useTranslation } from 'react-i18next';

// Calls someone whose number I'm already allowed to see: a tel: link opens
// the phone's dialer (on a computer, the system's call app if there is one).
export function CallButton({
  phone,
  name,
  compact = false,
  className = '',
}: {
  phone: string | null | undefined;
  name: string;
  // Just the 📞 icon (conversation header), the name in its label.
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!phone) return null;
  const label = t('contact.call', { name });
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      className={`button-link call-button${compact ? ' compact' : ''} ${className}`.trim()}
      aria-label={label}
      title={compact ? label : undefined}
    >
      <span aria-hidden="true">📞</span>
      {!compact && ` ${label}`}
    </a>
  );
}
