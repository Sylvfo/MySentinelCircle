export function AlertsPage() {
  return (
    <div>
      <h1>Alertes</h1>
      <p style={{ color: 'var(--text-muted)' }}>Alertes en cours et historique.</p>
      <div className="empty-state">Aucune alerte pour l'instant — le module Alert n'est pas encore codé.</div>
    </div>
  );
}
