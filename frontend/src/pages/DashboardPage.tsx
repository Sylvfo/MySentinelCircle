import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p style={{ color: 'var(--text-muted)' }}>{user?.email ?? user?.phone}</p>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">Alertes en cours</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">Cercles</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">Companions</div>
        </div>
        <div className="summary-card">
          <div className="value">0</div>
          <div className="label">Messages non lus</div>
        </div>
      </div>

      <div className="empty-state">Les résumés seront branchés une fois les modules Sentinel/Alert/Messaging codés.</div>
    </div>
  );
}
