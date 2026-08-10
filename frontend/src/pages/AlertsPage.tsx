import { useTranslation } from 'react-i18next';

export function AlertsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t('alerts.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('alerts.intro')}</p>
      <div className="empty-state">{t('alerts.empty')}</div>
    </div>
  );
}
