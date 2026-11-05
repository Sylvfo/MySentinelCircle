import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { removeMembership, updateMembership, type Circle, type Membership, type MessagingMode } from '../api/sentinel';

// What I can do about one of my Sentinels (role, messaging, placement) —
// shown on their person page (PersonPage), under "watches over you".
export function SentinelActions({
  m,
  circles,
  isPrimary,
  onChange,
  onError,
}: {
  m: Membership;
  circles: Circle[];
  isPrimary: boolean;
  onChange: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const otherCircles = circles.filter((c) => c.id !== m.circleId);
  const [moveTo, setMoveTo] = useState(otherCircles[0]?.id ?? '');

  const remove = async () => {
    if (!window.confirm(t('circles.confirmRemoveMember'))) return;
    try {
      await removeMembership(m.id);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const move = async () => {
    if (!moveTo) return;
    try {
      await updateMembership(m.id, { circleId: moveTo });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const toggleLead = async () => {
    try {
      await updateMembership(m.id, { requestedAsLead: !m.leadSlot });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  // Permanent Me<->Sentinel channel — per-individual override (beats the
  // circle's own setting). null resolves to "allowed" unless set false.
  const memberCanMessage = m.canMessageMe !== false;
  const toggleMemberCanMessage = async () => {
    try {
      await updateMembership(m.id, { canMessageMe: !memberCanMessage });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  // Alert-time only: can this 1st-circle Sentinel join the live group chat
  // once an alert is raised. Separate from canMessageMe above.
  const toggleCanMessageOwnCircle = async () => {
    try {
      await updateMembership(m.id, { canMessageOwnCircle: !m.canMessageOwnCircle });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  // Outer-circle Sentinels only: whether this Sentinel can later open an
  // isolated chat with the 1st circle once solicited on an alert. Set any
  // time, not alert-specific — whatever value it has when an alert next
  // contacts this Sentinel is what gets frozen in for that alert.
  const setFirstCircleMessagingMode = async (mode: MessagingMode) => {
    try {
      await updateMembership(m.id, { firstCircleMessagingMode: mode });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const proposedCircleLabel = m.proposedCircleId
    ? circles.find((c) => c.id === m.proposedCircleId)?.label
    : null;

  // Manual call order for batched alert escalation (max 2 contacted at a
  // time, see AlertService.requestCircle) — outer circles only, the 1st
  // circle always notifies everyone at once.
  const [callOrderInput, setCallOrderInput] = useState(m.callOrder?.toString() ?? '');
  const saveCallOrder = async () => {
    const trimmed = callOrderInput.trim();
    const value = trimmed === '' ? undefined : Number(trimmed);
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return;
    if (value === undefined || value === m.callOrder) return;
    try {
      await updateMembership(m.id, { callOrder: value });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <div className="member-panel">
      <div className="member-panel-badges">
        <span className={`badge status-${m.status.toLowerCase()}`}>{t(`sentinel.status.${m.status}`)}</span>
        <span className="badge">{t(`sentinel.type.${m.sentinelType}`)}</span>
        {m.leadSlot && <span className="badge">{t('sentinel.leadSentinel')}</span>}
        {proposedCircleLabel && <span className="badge">{t('circles.awaitingFirstCircleConsent')}</span>}
      </div>
      {/* Three sections: role on top, messaging in the middle, then where
          this Sentinel sits among my circles (move / remove). Empty sections
          aren't shown. */}
      {m.status === 'ACCEPTED' && (
        <section className="member-panel-section">
          {isPrimary ? (
            <button className="ghost" onClick={toggleLead}>
              {m.leadSlot ? t('circles.removeLead') : t('circles.makeLead')}
            </button>
          ) : (
            <label className="row" style={{ gap: '0.3rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('circles.callOrder.label')}</span>
              <input
                type="number"
                min={1}
                style={{ width: '3.5rem' }}
                placeholder={t('circles.callOrder.random')}
                value={callOrderInput}
                onChange={(e) => setCallOrderInput(e.target.value)}
                onBlur={saveCallOrder}
              />
            </label>
          )}
        </section>
      )}

      {m.sentinelType !== 'ONLY_SMS' && m.status === 'ACCEPTED' && (
        <section className="member-panel-section">
          <h4>{t('circles.memberSections.messages')}</h4>
          <button className="ghost" onClick={toggleMemberCanMessage}>
            {memberCanMessage ? t('circles.blockMessaging') : t('circles.allowMessaging')}
          </button>
          {isPrimary && (
            <button className="ghost" onClick={toggleCanMessageOwnCircle}>
              {m.canMessageOwnCircle ? t('circles.excludeFromAlertChat') : t('circles.includeInAlertChat')}
            </button>
          )}
          {/* GROUP exists in the schema but isn't exposed here yet — it
              currently behaves identically to INDIVIDUAL (same isolated
              chat), so a 3rd option would just be a misleading duplicate
              until it actually means something different. */}
          {!isPrimary && (
            <label className="row" style={{ gap: '0.3rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('circles.firstCircleMessagingMode.label')}
              </span>
              <select
                value={m.firstCircleMessagingMode === 'NONE' ? 'NONE' : 'INDIVIDUAL'}
                onChange={(e) => setFirstCircleMessagingMode(e.target.value as MessagingMode)}
              >
                <option value="NONE">{t('circles.firstCircleMessagingMode.none')}</option>
                <option value="INDIVIDUAL">{t('circles.firstCircleMessagingMode.individual')}</option>
              </select>
            </label>
          )}
        </section>
      )}

      <section className="member-panel-section">
        <h4>{t('circles.memberSections.placement')}</h4>
        {otherCircles.length > 0 && (
          <div className="row">
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {otherCircles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button className="ghost" onClick={move}>
              {t('circles.move')}
            </button>
          </div>
        )}
        <button className="ghost" onClick={remove}>
          {t('circles.removeMember')}
        </button>
      </section>
    </div>
  );
}
