import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import {
  closeAlert,
  getAlert,
  listAlerts,
  raiseAlert,
  requestCircle,
  respondToAlert,
  type AlertDetail,
  type AlertSummary,
  type AlertType,
} from '../api/alert';
import { listCompanions, type Companion } from '../api/sentinel';
import { listMessages, sendMessage, type Message } from '../api/messaging';

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
            <AlertRow key={a.id} alert={a} onChange={reload} />
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

function AlertRow({ alert, onChange }: { alert: AlertSummary; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="row">
        <span>
          {t(`alerts.type.${alert.alertType}`)}
          <span className="badge">{t(`alerts.status.${alert.alertStatus}`)}</span>
        </span>
        <span className="row-actions">
          <button className="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('alerts.detail.hide') : t('alerts.detail.show')}
          </button>
          {alert.alertStatus !== 'RESOLVED' && (
            <button className="ghost" onClick={() => closeAlert(alert.id).then(onChange)}>
              {t('alerts.close')}
            </button>
          )}
        </span>
      </div>
      {expanded && <AlertDetailPanel alertId={alert.id} />}
    </div>
  );
}

function AlertDetailPanel({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  // null = chat not accessible to this caller (e.g. the companion, by design).
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const conversationId = detail?.conversations[0]?.id;

  const reloadMessages = async (convId: string) => {
    try {
      setMessages(await listMessages(convId));
    } catch {
      setMessages(null);
    }
  };

  const loadDetail = async () => {
    try {
      const d = await getAlert(alertId);
      setDetail(d);
      const convId = d.conversations[0]?.id;
      if (convId) await reloadMessages(convId);
      else setMessages(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadDetail().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const submitMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(conversationId, draft.trim());
      setDraft('');
      await reloadMessages(conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;
  if (!detail) return error ? <p className="form-error">{error}</p> : null;

  const senderName = (senderId: string) => {
    if (senderId === user?.id) return t('alerts.detail.me');
    const participant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === senderId);
    return participant?.userSentinels.linkAsSentinel.firstName ?? '…';
  };

  const myParticipant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === user?.id);
  const isCompanion = user?.id === detail.userCompanion.id;
  const isAlertManager = isCompanion || myParticipant?.circleId === detail.firstCircleId;
  const canRequestCircle = isAlertManager && detail.alertStatus !== 'RESOLVED';
  const canRespond = myParticipant?.status === 'CONTACTED' && detail.alertStatus !== 'RESOLVED';

  return (
    <div className="alert-detail">
      <p>{t('alerts.detail.about', { name: detail.userCompanion.firstName })}</p>
      <p>
        <strong>{t('alerts.detail.reason')} :</strong> {detail.messageAlert}
      </p>

      <h3>{t('alerts.detail.participants')}</h3>
      <ul>
        {detail.participants.map((p) => (
          <li key={p.id}>
            {p.userSentinels.linkAsSentinel.firstName}
            {p.isLead && <span className="badge">{t('alerts.detail.lead')}</span>}
            <span style={{ color: 'var(--text-muted)' }}> — {p.circleName}</span>
            {p.response && (
              <span style={{ color: 'var(--text-muted)' }}> · {t('alerts.detail.response', { response: p.response })}</span>
            )}
          </li>
        ))}
      </ul>

      {canRespond && (
        <section className="panel">
          <p>{t('alerts.detail.respond.prompt')}</p>
          <div className="row">
            <button onClick={() => respondToAlert(alertId, true).then(loadDetail)}>
              {t('alerts.detail.respond.yes')}
            </button>
            <button className="ghost" onClick={() => respondToAlert(alertId, false).then(loadDetail)}>
              {t('alerts.detail.respond.no')}
            </button>
          </div>
        </section>
      )}

      {canRequestCircle && <RequestCircleForm alertId={alertId} circles={detail.userCompanion.myCircles} onChange={loadDetail} />}

      {messages !== null && conversationId && (
        <div className="alert-chat">
          <h3>{t('alerts.detail.chatTitle')}</h3>
          {messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
          ) : (
            <ul className="alert-chat-messages">
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{senderName(m.senderId)}</strong> : {m.body}
                </li>
              ))}
            </ul>
          )}
          <form className="row" onSubmit={submitMessage}>
            <input
              placeholder={t('alerts.detail.messagePlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {t('alerts.detail.send')}
            </button>
          </form>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function RequestCircleForm({
  alertId,
  circles,
  onChange,
}: {
  alertId: string;
  circles: { id: string; label: string }[];
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [circleId, setCircleId] = useState(circles[0]?.id ?? '');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (circles.length === 0) {
    return (
      <section className="panel">
        <h3>{t('alerts.detail.requestCircle.title')}</h3>
        <div className="empty-state">{t('alerts.detail.requestCircle.noCircles')}</div>
      </section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestCircle(alertId, { circleId, question: question.trim() });
      setQuestion('');
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <h3>{t('alerts.detail.requestCircle.title')}</h3>
      <div className="row wrap">
        <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          required
          placeholder={t('alerts.detail.requestCircle.questionPlaceholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={submitting || !circleId || !question.trim()}>
          {t('alerts.detail.requestCircle.submit')}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
