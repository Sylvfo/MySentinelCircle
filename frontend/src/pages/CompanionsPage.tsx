export function CompanionsPage() {
  return (
    <div>
      <h1>Companions</h1>
      <p style={{ color: 'var(--text-muted)' }}>Les personnes dont vous êtes le Sentinel — celles que vous surveillez.</p>
      <div className="empty-state">Aucun Companion pour l'instant — le module Sentinel n'est pas encore codé.</div>
    </div>
  );
}
