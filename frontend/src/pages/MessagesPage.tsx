import { useTranslation } from 'react-i18next';

export function MessagesPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t('messages.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('messages.intro')}</p>
      <div className="empty-state">{t('messages.empty')}</div>
    </div>
  );
}
