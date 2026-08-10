import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{user?.email ?? user?.phone}</p>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">{t('dashboard.activeAlerts')}</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">{t('dashboard.circles')}</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">{t('dashboard.companions')}</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">{t('dashboard.unreadMessages')}</div>
        </div>
      </div>

      <div className="empty-state">{t('dashboard.placeholder')}</div>
    </div>
  );
}
