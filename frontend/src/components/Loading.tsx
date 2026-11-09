import { useTranslation } from 'react-i18next';

// The grey "Loading…" line shown while a page fetches its data.
export function Loading() {
  const { t } = useTranslation();
  return <p className="muted">{t('common.loading')}</p>;
}
