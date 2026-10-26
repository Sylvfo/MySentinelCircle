import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { closeAlert, listAlerts, raiseAlert, type AlertSummary, type AlertType } from '../api/alert';
import { listCompanions, type Companion } from '../api/sentinel';

// BYCOMPANION is reserved for "Me" raising for themself (RaiseForSelfPanel) —
// it wouldn't make sense coming from a Sentinel raising on someone else's behalf.
const COMPANION_ALERT_TYPES: AlertType[] = ['LITTLEWORRY', 'MISSING', 'INCIDENT', 'EMERGENCY', 'NOCONTACT', 'UNKNOWN'];

export function AlertsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    try {
      setAlerts(await listAlerts());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const myActiveAlert = alerts.find((a) => a.userCompanionId === user?.id && a.alertStatus !== 'RESOLVED');

  return (
    <div>
      <h1>{t('alerts.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('alerts.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      <RaiseForSelfPanel activeAlert={myActiveAlert} onChange={reload} />

      {alerts.length === 0 ? (
        <div className="empty-state">{t('alerts.empty')}</div>
      ) : (
        <section className="panel">
          {alerts.map((a) => (
            <div key={a.id} className="row">
              <span>
                {t(`alerts.type.${a.alertType}`)}
                <span className="badge">{t(`alerts.status.${a.alertStatus}`)}</span>
              </span>
              {a.alertStatus !== 'RESOLVED' && (
                <button className="ghost" onClick={() => closeAlert(a.id).then(reload)}>
                  {t('alerts.close')}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <RaiseForCompanionForm onRaised={reload} />
    </div>
  );
}

function RaiseForSelfPanel({
  activeAlert,
  onChange,
}: {
  activeAlert: AlertSummary | undefined;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (activeAlert) {
    return (
      <section className="panel alert-active">
        <p>{t('alerts.activeAlertNotice')}</p>
        <button className="ghost" onClick={() => closeAlert(activeAlert.id).then(onChange)}>
          {t('alerts.close')}
        </button>
      </section>
    );
  }

  const raise = async () => {
    if (!user || !window.confirm(t('alerts.confirmRaise'))) return;
    setSubmitting(true);
    setError(null);
    try {
      await raiseAlert({ companionId: user.id, alertType: 'BYCOMPANION', reason: t('alerts.defaultReason') });
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel">
      <button className="alert-btn" disabled={submitting || !user} onClick={raise}>
        {t('alerts.raiseForSelf')}
      </button>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function RaiseForCompanionForm({ onRaised }: { onRaised: () => Promise<void> }) {
  const { t } = useTranslation();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loadingCompanions, setLoadingCompanions] = useState(true);
  const [companionId, setCompanionId] = useState('');
  const [alertType, setAlertType] = useState<AlertType>(COMPANION_ALERT_TYPES[0]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Any Sentinel (any circle) is authorized to raise — it always notifies
    // the companion's 1st circle regardless of which circle the raiser is in.
    listCompanions()
      .then((all) => {
        setCompanions(all);
        if (all.length > 0) setCompanionId(all[0].companion.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoadingCompanions(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await raiseAlert({ companionId, alertType, reason: reason.trim() });
      setReason('');
      await onRaised();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCompanions) return null;

  if (companions.length === 0) {
    return (
      <section className="panel">
        <h2>{t('alerts.raiseForCompanion')}</h2>
        <div className="empty-state">{t('alerts.noCompanions')}</div>
      </section>
    );
  }

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <h2>{t('alerts.raiseForCompanion')}</h2>
      <p style={{ color: 'var(--text-muted)' }}>{t('alerts.raiseForCompanionIntro')}</p>
      <div className="row wrap">
        <select value={companionId} onChange={(e) => setCompanionId(e.target.value)}>
          {companions.map((c) => (
            <option key={c.linkId} value={c.companion.id}>
              {c.companion.email ?? c.companion.phone}
            </option>
          ))}
        </select>
        <select value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)}>
          {COMPANION_ALERT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`alerts.type.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <input
          required
          placeholder={t('alerts.reasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" disabled={submitting || !companionId || !reason.trim()}>
          {t('alerts.submit')}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
