import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../api/client';
import { claimLead, leaveAlert, requestCircleChat, updateAlertLocation, type AlertLocation } from '../api/alert';
import { APPROXIMATE_ACCURACY_M, formatAccuracy, useLocate } from '../geolocation';
import { ConfirmModal } from './Modal';
import { useAction } from '../useAction';

// The outer-circle Sentinel's own request-then-chat UI, in the
// myParticipation fallback view — starts as a button (lazy, so just
// viewing the alert doesn't create a conversation), opens into a
// ConversationThread once requested. Any 1st-circle sender is shown
// generically ("1st circle"): this caller never sees the 1st circle's
// own roster.
export function CircleChatSection({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // The chat itself lives in Messages; created (or found) on click.
  return (
    <section className="panel">
      <button
        onClick={() =>
          requestCircleChat(alertId)
            .then((c) => navigate(`/messages/alert/${c.id}`))
            .catch((err) => setError(errorText(err)))
        }
      >
        {t('alerts.detail.circleChat.title')}
      </button>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

// A labeled text field (the alert's name, or one side's live status note);
// editable in place only when `onSave` is given (i.e. the caller is allowed
// to write it). `meta`, when given, shows who last wrote the current value.
export function StatusNoteField({
  label,
  value,
  placeholder,
  meta,
  onSave,
  maxLength = 500,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  meta?: string;
  onSave?: (message: string) => Promise<unknown>;
  // The backend's limit for this text (UpdateAlertStatusDto / UpdateAlertLabelDto).
  maxLength?: number;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  // Nothing written yet: hidden for whoever can only read it; an empty
  // field (with its example) for whoever may write it.
  if (!value && !onSave) return null;
  const empty = !value;

  if ((editing || empty) && onSave) {
    const save = async () => {
      if (!draft.trim()) return;
      setSaving(true);
      try {
        await onSave(draft.trim());
        setEditing(false);
      } finally {
        setSaving(false);
      }
    };
    return (
      <label className="status-note-field">
        <strong>{label} :</strong>
        <span className="row">
          <input
            placeholder={placeholder ?? t('alerts.detail.status.placeholder')}
            maxLength={maxLength}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button onClick={save} disabled={saving || !draft.trim()}>
            {t('common.save')}
          </button>
          {!empty && (
            <button className="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </button>
          )}
        </span>
      </label>
    );
  }

  return (
    <p>
      <strong>{label} :</strong> {value} {value && meta && <span className="muted">{meta}</span>}{' '}
      {onSave && (
        <button
          className="ghost"
          onClick={() => {
            setDraft(value ?? '');
            setEditing(true);
          }}
        >
          {t('common.edit')}
        </button>
      )}
    </p>
  );
}

// Another Lead takes over the responsibility for the alert, once confirmed:
// the current responsible Lead is told.
export function TakeOverButton({ alertId, onDone }: { alertId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button className="ghost" onClick={() => setAsking(true)}>
        {t('alerts.detail.claimLead')}
      </button>
      {asking && (
        <ConfirmModal
          message={t('alerts.detail.takeOverConfirm')}
          confirmLabel={t('alerts.detail.claimLead')}
          onConfirm={() => {
            setAsking(false);
            void claimLead(alertId).then(onDone);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}

// Backend messages the leave flow can hit, shown translated instead of raw.
const LEAVE_ERRORS: Record<string, string> = {
  'Another Lead must take the lead before you leave this alert': 'alerts.detail.leave.needOtherLead',
};

export function LeaveAlertButton({ alertId, onChange }: { alertId: string; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const { run } = useAction({
    onError: (message) => setError(LEAVE_ERRORS[message] ? t(LEAVE_ERRORS[message]) : message),
  });

  const leave = () => {
    setAsking(false);
    setError(null);
    return run(async () => {
      await leaveAlert(alertId);
      await onChange();
    });
  };

  return (
    <div>
      <button className="ghost" onClick={() => setAsking(true)}>
        {t('alerts.detail.leave.button')}
      </button>
      {asking && (
        <ConfirmModal
          message={t('alerts.detail.leave.confirm')}
          confirmLabel={t('alerts.detail.leave.button')}
          onConfirm={() => void leave()}
          onCancel={() => setAsking(false)}
        />
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// Says so when the position is only a rough guess — it's still sent.
export function ApproximateWarning({ location }: { location: AlertLocation }) {
  const { t } = useTranslation();
  if ((location.accuracy ?? 0) <= APPROXIMATE_ACCURACY_M) return null;
  return (
    <p className="alert-location-warning">
      ⚠{' '}
      {t('alerts.location.approximate', {
        accuracy: formatAccuracy(location.accuracy ?? 0),
      })}
    </p>
  );
}

// In my own running alert: send where I am now, as often as I like.
export function UpdateMyPosition({ alertId, onDone }: { alertId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { locate, locating, error } = useLocate();
  const [sent, setSent] = useState<AlertLocation | null>(null);
  const { busy: sending, error: sendError, setError: setSendError, run } = useAction();
  // First where I am, then sending it.
  const update = async () => {
    setSendError(null);
    const loc = await locate();
    if (!loc) return;
    await run(async () => {
      await updateAlertLocation(alertId, loc);
      setSent(loc);
      onDone();
    });
  };
  return (
    <div className="alert-location">
      <button type="button" className="ghost" disabled={locating || sending} onClick={() => void update()}>
        📍 {locating ? t('alerts.location.locating') : t('alerts.location.update')}
      </button>
      {sent && (
        <small>
          ✓{' '}
          {t('alerts.location.updated', {
            accuracy: formatAccuracy(sent.accuracy ?? 0),
          })}
        </small>
      )}
      {sent && <ApproximateWarning location={sent} />}
      {error && <small>{t(`alerts.location.${error}`)}</small>}
      {sendError && <p className="form-error">{sendError}</p>}
    </div>
  );
}
