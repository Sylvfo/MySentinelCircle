import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError, API_URL } from '../api/client';
import {
  claimLead,
  closeAlert,
  getAlert,
  getMyParticipation,
  listAlerts,
  raiseAlert,
  requestCircle,
  requestCircleChat,
  respondToAlert,
  updateAlertLabel,
  updateAlertStatus,
  type AlertDetail,
  type AlertParticipant,
  type AlertSummary,
  type AlertType,
  type MyParticipation,
} from '../api/alert';
import { listCompanions, type Companion } from '../api/sentinel';
import { listMessages, sendImageMessage, sendMessage, type Message } from '../api/messaging';

// BYCOMPANION is reserved for "Me" raising for themself (RaiseForSelfPanel) —
// it wouldn't make sense coming from a Sentinel raising on someone else's behalf.
const COMPANION_ALERT_TYPES: AlertType[] = ['LITTLEWORRY', 'MISSING', 'INCIDENT', 'EMERGENCY', 'NOCONTACT', 'UNKNOWN'];

export function AlertsPage() {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
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
    void reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('alert:changed', reload);
    return () => {
      socket.off('alert:changed', reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

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
  const { user, socket } = useAuth();
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  // Set only when getAlert() 403s (e.g. an outer-circle Sentinel) but the
  // caller does have their own participation to show, as a lighter fallback.
  const [myParticipation, setMyParticipation] = useState<MyParticipation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    try {
      const d = await getAlert(alertId);
      setDetail(d);
      setMyParticipation(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        try {
          setDetail(null);
          setMyParticipation(await getMyParticipation(alertId));
          return;
        } catch (fallbackErr) {
          setError(fallbackErr instanceof ApiError ? fallbackErr.message : String(fallbackErr));
          return;
        }
      }
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void loadDetail().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  useEffect(() => {
    if (!socket) return;
    const onAlertChanged = (payload: { alertId: string }) => {
      if (payload.alertId === alertId) void loadDetail();
    };
    socket.on('alert:changed', onAlertChanged);
    return () => {
      socket.off('alert:changed', onAlertChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, alertId]);

  // The companion reads every conversation's transcript straight off
  // `detail.conversations[].messages` (they're never a ConversationParticipant,
  // so listMessages() would 403 them) — a new message in one of this
  // alert's own conversations means re-fetching the whole alert to pick it
  // up. A Sentinel's own ConversationThread below handles its own
  // conversation's live updates independently, so this is a companion-only
  // concern in practice. Filtered against a ref (not `detail` in the
  // dependency array) so the listener isn't torn down and resubscribed on
  // every reload, and so a message:new for some unrelated conversation
  // elsewhere doesn't cause a wasted GET here — the global rate limit is
  // shared across the whole app, so this adds up fast under heavy use.
  const detailRef = useRef<AlertDetail | null>(null);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (detailRef.current?.conversations.some((c) => c.id === payload.conversationId)) {
        void loadDetail();
      }
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, alertId]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  if (!detail) {
    if (myParticipation) {
      const canRespondLight =
        myParticipation.status === 'CONTACTED' && myParticipation.alert.alertStatus !== 'RESOLVED';
      const canChat =
        !!myParticipation.firstCircleMessagingModeAtAlert &&
        myParticipation.firstCircleMessagingModeAtAlert !== 'NONE' &&
        myParticipation.alert.alertStatus !== 'RESOLVED';
      return (
        <div className="alert-detail">
          <h3>{myParticipation.alert.label}</h3>
          <p>{t('alerts.detail.about', { name: myParticipation.alert.userCompanion.firstName })}</p>
          <StatusNoteField label={t('alerts.detail.statusByCompanion')} value={myParticipation.alert.statusByCompanion} />
          <StatusNoteField label={t('alerts.detail.statusByFirstCircle')} value={myParticipation.alert.statusByFirstCircle} />
          <p style={{ color: 'var(--text-muted)' }}>
            {myParticipation.circleName}
            {myParticipation.response && ` · ${t('alerts.detail.response', { response: myParticipation.response })}`}
          </p>
          {canRespondLight && <RespondButtons alertId={alertId} onChange={loadDetail} />}
          {canChat && <CircleChatSection alertId={alertId} />}
          {error && <p className="form-error">{error}</p>}
        </div>
      );
    }
    return error ? <p className="form-error">{error}</p> : null;
  }

  const senderName = (senderId: string) => {
    if (senderId === user?.id) return t('alerts.detail.me');
    const participant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === senderId);
    return participant?.userSentinels.linkAsSentinel.firstName ?? '…';
  };

  const myParticipant = detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === user?.id);
  const isCompanion = user?.id === detail.userCompanion.id;
  const isFirstCircleSentinel = !isCompanion && myParticipant?.circleId === detail.firstCircleId;
  const isAlertManager = isCompanion || isFirstCircleSentinel;
  const canRequestCircle = isAlertManager && detail.alertStatus !== 'RESOLVED';
  const canRespond = myParticipant?.status === 'CONTACTED' && detail.alertStatus !== 'RESOLVED';

  // No "current lead" stored separately — whichever Lead has the latest
  // leadAssignedAt is the one currently driving the alert. Any Lead can
  // claim/reclaim it at any time, no wait window (see claimLead).
  const leadClaims = detail.participants.filter((p) => p.isLead && p.leadAssignedAt);
  const activeLead = leadClaims.length
    ? leadClaims.reduce((a, b) => (a.leadAssignedAt! > b.leadAssignedAt! ? a : b))
    : null;
  const canClaimLead = myParticipant?.isLead && detail.alertStatus !== 'RESOLVED';

  // Who's in the 1st circle, for telling the main chat apart from an
  // isolated one when labeling each entry in detail.conversations below.
  const firstCircleSentinelIds = new Set(
    detail.participants.filter((p) => p.circleId === detail.firstCircleId).map((p) => p.userSentinels.linkAsSentinel.id),
  );

  const labelMeta = detail.labelUpdatedBy ? t('alerts.detail.updatedBy', { name: detail.labelUpdatedBy.firstName }) : undefined;
  const statusFirstCircleMeta = detail.statusUpdatedBy
    ? t('alerts.detail.updatedBy', { name: detail.statusUpdatedBy.firstName })
    : undefined;

  return (
    <div className="alert-detail">
      {/* The name: any 1st-circle Sentinel can set/rename it. */}
      <StatusNoteField
        label={t('alerts.detail.labelField')}
        value={detail.label}
        placeholder={t('alerts.detail.labelPlaceholder')}
        meta={labelMeta}
        onSave={isFirstCircleSentinel ? (label) => updateAlertLabel(alertId, label).then(loadDetail) : undefined}
      />
      <p>{t('alerts.detail.about', { name: detail.userCompanion.firstName })}</p>

      {/* Two separate status notes, not one shared field — the companion
          writes statusByCompanion, any 1st-circle Sentinel writes
          statusByFirstCircle. Both stay editable after the alert is
          resolved, unlike the chat below, which locks once its
          Conversation closes. */}
      <StatusNoteField
        label={t('alerts.detail.statusByCompanion')}
        value={detail.statusByCompanion}
        onSave={isCompanion ? (message) => updateAlertStatus(alertId, message).then(loadDetail) : undefined}
      />
      <StatusNoteField
        label={t('alerts.detail.statusByFirstCircle')}
        value={detail.statusByFirstCircle}
        meta={statusFirstCircleMeta}
        onSave={isFirstCircleSentinel ? (message) => updateAlertStatus(alertId, message).then(loadDetail) : undefined}
      />

      <h3>{t('alerts.detail.participants')}</h3>
      <p>
        {activeLead
          ? t('alerts.detail.currentLead', { name: activeLead.userSentinels.linkAsSentinel.firstName })
          : t('alerts.detail.noLeadYet')}
        {canClaimLead && (
          <button className="ghost" onClick={() => claimLead(alertId).then(loadDetail)}>
            {t('alerts.detail.claimLead')}
          </button>
        )}
      </p>
      <ul>
        {detail.participants.map((p) => (
          <li key={p.id}>
            {p.userSentinels.linkAsSentinel.firstName}
            {p.isLead && <span className="badge">{t('alerts.detail.lead')}</span>}
            {activeLead?.id === p.id && (
              <span className="badge status-accepted">{t('alerts.detail.activeLeadBadge')}</span>
            )}
            <span className="badge">{t(`alerts.detail.participantStatus.${p.status}`)}</span>
            <span style={{ color: 'var(--text-muted)' }}> — {p.circleName}</span>
            {p.requestedBy && (
              <span style={{ color: 'var(--text-muted)' }}> · {t('alerts.detail.requestedBy', { name: p.requestedBy.firstName })}</span>
            )}
            {p.response && (
              <span style={{ color: 'var(--text-muted)' }}> · {t('alerts.detail.response', { response: p.response })}</span>
            )}
          </li>
        ))}
      </ul>

      {canRespond && <RespondButtons alertId={alertId} onChange={loadDetail} />}

      {canRequestCircle && (
        <RequestCircleForm
          alertId={alertId}
          circles={detail.userCompanion.myCircles}
          participants={detail.participants}
          onChange={loadDetail}
        />
      )}

      {/* One block per conversation on this alert: the main 1st-circle
          chat, plus one per outer-circle Sentinel who's opened an
          isolated chat with the 1st circle. Told apart by participants —
          any conversation with someone outside the 1st circle is an
          isolated one, labeled with their name. */}
      {detail.conversations.map((conv) => {
        const outsider = conv.participants.find((p) => !firstCircleSentinelIds.has(p.user.id));
        const title = outsider
          ? t('alerts.detail.circleChat.withSentinel', { name: outsider.user.firstName })
          : t('alerts.detail.chatTitle');
        if (isCompanion) {
          // Never a ConversationParticipant (by design) — read-only,
          // straight off getAlert() instead of listMessages()/sendMessage(),
          // which would just 403 them.
          return (
            <div className="alert-chat" key={conv.id}>
              <h3>{title}</h3>
              {conv.messages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
              ) : (
                <ul className="alert-chat-messages">
                  {conv.messages.map((m) => (
                    <li key={m.id}>
                      <strong>{m.sender.firstName}</strong> : {m.body}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        return <ConversationThread key={conv.id} conversationId={conv.id} title={title} resolveSenderName={senderName} />;
      })}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// Self-contained message list + input + its own message:new socket
// listener for one conversation — used for the main 1st-circle chat, each
// isolated outer-circle chat in the full alert view, and the outer-circle
// Sentinel's own isolated-chat UI below. Hides itself entirely if the
// viewer turns out not to be a participant (e.g. a 1st-circle Sentinel
// excluded from their own circle's chat) rather than showing a bare error.
function ConversationThread({
  conversationId,
  title,
  resolveSenderName,
}: {
  conversationId: string;
  title: string;
  resolveSenderName: (senderId: string) => string;
}) {
  const { t } = useTranslation();
  const { user, socket } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setMessages(await listMessages(conversationId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) void reload();
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(conversationId, draft.trim());
      setDraft('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const submitImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSending(true);
    try {
      await sendImageMessage(conversationId, file);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading || forbidden) return null;

  return (
    <div className="alert-chat">
      <h3>{title}</h3>
      {messages && messages.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.noMessages')}</p>
      ) : (
        <ul className="alert-chat-messages">
          {messages?.map((m) => (
            <li key={m.id}>
              <strong>{m.senderId === user?.id ? t('alerts.detail.me') : resolveSenderName(m.senderId)}</strong> :{' '}
              {m.type === 'IMAGE' ? (
                <img src={`${API_URL}/uploads/messages/${m.body}`} alt="" style={{ maxWidth: 200, borderRadius: 8, display: 'block' }} />
              ) : (
                m.body
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={submit}>
        <input
          placeholder={t('alerts.detail.messagePlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {t('alerts.detail.send')}
        </button>
        <input type="file" accept="image/*" disabled={sending} onChange={submitImage} />
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// The outer-circle Sentinel's own request-then-chat UI, in the
// myParticipation fallback view — starts as a button (lazy, so just
// viewing the alert doesn't create a conversation), opens into a
// ConversationThread once requested. Any 1st-circle sender is shown
// generically ("1st circle"): this caller never sees the 1st circle's
// own roster.
function CircleChatSection({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!conversationId) {
    return (
      <section className="panel">
        <button
          onClick={() =>
            requestCircleChat(alertId)
              .then((c) => setConversationId(c.id))
              .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
          }
        >
          {t('alerts.detail.circleChat.title')}
        </button>
        {error && <p className="form-error">{error}</p>}
      </section>
    );
  }

  return (
    <ConversationThread
      conversationId={conversationId}
      title={t('alerts.detail.circleChat.title')}
      resolveSenderName={() => t('alerts.detail.circleChat.firstCircleSender')}
    />
  );
}

// A labeled text field (the alert's name, or one side's live status note);
// editable in place only when `onSave` is given (i.e. the caller is allowed
// to write it). `meta`, when given, shows who last wrote the current value.
function StatusNoteField({
  label,
  value,
  placeholder,
  meta,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  meta?: string;
  onSave?: (message: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  if (editing && onSave) {
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
      <div className="row">
        <input
          placeholder={placeholder ?? t('alerts.detail.status.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button onClick={save} disabled={saving || !draft.trim()}>
          {t('common.save')}
        </button>
        <button className="ghost" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <p>
      <strong>{label} :</strong> {value ?? <span style={{ color: 'var(--text-muted)' }}>{t('alerts.detail.status.none')}</span>}{' '}
      {value && meta && <span style={{ color: 'var(--text-muted)' }}>{meta}</span>}{' '}
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

function RespondButtons({ alertId, onChange }: { alertId: string; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <section className="panel">
      <p>{t('alerts.detail.respond.prompt')}</p>
      <div className="row">
        <button onClick={() => respondToAlert(alertId, true).then(onChange)}>{t('alerts.detail.respond.yes')}</button>
        <button className="ghost" onClick={() => respondToAlert(alertId, false).then(onChange)}>
          {t('alerts.detail.respond.no')}
        </button>
      </div>
    </section>
  );
}

function RequestCircleForm({
  alertId,
  circles,
  participants,
  onChange,
}: {
  alertId: string;
  circles: { id: string; label: string }[];
  participants: AlertParticipant[];
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [circleId, setCircleId] = useState(circles[0]?.id ?? '');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once a circle has at least one contacted member, calling this again is
  // "contact more" (the next batch of 2), not the original ask.
  const isRepeatRequest = participants.some(
    (p) => p.circleId === circleId && p.status !== 'WAITING',
  );

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
          {t(
            isRepeatRequest
              ? 'alerts.detail.requestCircle.submitMore'
              : 'alerts.detail.requestCircle.submit',
          )}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
