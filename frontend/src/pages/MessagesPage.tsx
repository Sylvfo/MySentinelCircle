export function MessagesPage() {
  return (
    <div>
      <h1>Messages</h1>
      <p style={{ color: 'var(--text-muted)' }}>Conversations avec vos Sentinels et requêtes en attente.</p>
      <div className="empty-state">Aucun message pour l'instant — le module Messaging n'est pas encore codé.</div>
    </div>
  );
}
