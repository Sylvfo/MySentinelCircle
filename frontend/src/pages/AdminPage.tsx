import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { getAdminStats } from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { useLoad } from '../useLoad';
import { Loading } from '../components/Loading';

// /admin — for the accounts listed in ADMIN_EMAILS only (the server refuses
// everyone else): how the app is used and whether someone is trying to get
// in. Counts only, no names.
export function AdminPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: stats, loading, error, reload } = useLoad(getAdminStats);

  if (user && !user.isAdmin) return <Navigate to="/dashboard" replace />;
  if (loading) return <Loading />;
  if (!stats) return <p className="form-error">{error}</p>;

  const n = (value: number) => value.toLocaleString(i18n.language);
  const maxWeek = Math.max(1, ...stats.accounts.perWeek.map((w) => w.count));
  const days = Math.floor(stats.server.uptimeSeconds / 86_400);
  const hours = Math.floor((stats.server.uptimeSeconds % 86_400) / 3600);
  const { security } = stats;
  const alarm = security.suspiciousNetworks.length > 0 || security.targetedAccounts > 0;

  return (
    <div className="admin-page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('admin.title')}</h1>
        <button type="button" className="ghost" onClick={() => void reload()}>
          {t('admin.refresh')}
        </button>
      </div>
      <p className="muted muted-small">
        {t('admin.generatedAt', { date: new Date(stats.generatedAt).toLocaleString(i18n.language) })}
      </p>
      {error && <p className="form-error">{error}</p>}

      <AdminSection title={t('admin.accounts.title')}>
        <Stat label={t('admin.accounts.total')} value={n(stats.accounts.total)} />
        <Stat label={t('admin.accounts.new7d')} value={n(stats.accounts.new7d)} />
        <Stat label={t('admin.accounts.new30d')} value={n(stats.accounts.new30d)} />
        <Stat label={t('admin.accounts.incomplete')} value={n(stats.accounts.incomplete)} />
        <Stat label={t('admin.accounts.smsOnly')} value={n(stats.accounts.smsOnly)} />
        <Stat label={t('admin.accounts.deleted')} value={n(stats.accounts.deleted)} />
      </AdminSection>
      <div className="admin-weeks" aria-label={t('admin.accounts.perWeek')}>
        <p className="muted muted-small">{t('admin.accounts.perWeek')}</p>
        <div className="admin-bars">
          {stats.accounts.perWeek.map((w) => (
            <div key={w.weekStart} className="admin-bar">
              <span className="admin-bar-count">{w.count}</span>
              <span className="admin-bar-fill" style={{ height: `${(w.count / maxWeek) * 70}%` }} />
              <span className="admin-bar-label">
                {new Date(w.weekStart).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AdminSection title={t('admin.activity.title')}>
        <Stat label={t('admin.activity.today')} value={n(stats.activity.activeToday)} />
        <Stat label={t('admin.activity.week')} value={n(stats.activity.active7d)} />
        <Stat label={t('admin.activity.month')} value={n(stats.activity.active30d)} />
      </AdminSection>

      <AdminSection title={t('admin.usage.title')}>
        <Stat label={t('admin.usage.alertsRunning')} value={n(stats.alerts.running)} />
        <Stat label={t('admin.usage.alerts30d')} value={n(stats.alerts.last30d)} />
        <Stat label={t('admin.usage.alertsTotal')} value={n(stats.alerts.total)} />
        <Stat label={t('admin.usage.messages30d')} value={n(stats.messages.last30d)} />
        <Stat label={t('admin.usage.groups')} value={n(stats.groups.total)} />
      </AdminSection>

      <AdminSection title={t('admin.security.title')} alarm={alarm}>
        <Stat label={t('admin.security.logins24h')} value={n(security.logins24h)} />
        <Stat label={t('admin.security.failures24h')} value={n(security.failures24h)} />
        <Stat label={t('admin.security.locked')} value={n(security.lockedAccounts)} />
        <Stat label={t('admin.security.targeted')} value={n(security.targetedAccounts)} />
      </AdminSection>
      <div className="admin-networks">
        <p className="muted muted-small">{t('admin.security.networksHint')}</p>
        {security.suspiciousNetworks.length === 0 ? (
          <p>{t('admin.security.noNetwork')}</p>
        ) : (
          <ul>
            {security.suspiciousNetworks.map((s) => (
              <li key={s.ipPrefix}>
                <strong>{s.ipPrefix}</strong> · {t('admin.security.failures', { count: s.failures })}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminSection title={t('admin.server.title')}>
        <Stat label={t('admin.server.uptime')} value={t('admin.server.uptimeValue', { days, hours })} />
        <Stat label={t('admin.server.version')} value={stats.server.version ?? '—'} />
      </AdminSection>
    </div>
  );
}

function AdminSection({ title, alarm, children }: { title: string; alarm?: boolean; children: ReactNode }) {
  return (
    <section className={`admin-section${alarm ? ' alarm' : ''}`}>
      <h2>{title}</h2>
      <div className="admin-grid">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  );
}
