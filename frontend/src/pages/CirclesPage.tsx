import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  acceptMembership,
  createCircle,
  declineMembership,
  deleteCircle,
  inviteSentinel,
  listCircles,
  listIncomingRequests,
  removeMembership,
  updateMembership,
  type Circle,
  type IncomingRequest,
  type Membership,
} from '../api/sentinel';

export function CirclesPage() {
  const { t } = useTranslation();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    try {
      const [c, r] = await Promise.all([listCircles(), listIncomingRequests()]);
      setCircles(c);
      setRequests(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  return (
    <div>
      <h1>{t('circles.title')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('circles.intro')}</p>
      {error && <p className="form-error">{error}</p>}

      <RequestsInbox requests={requests} circles={circles} onChange={reload} />
      <CreateCircleForm onCreated={reload} onError={setError} />

      {circles.length === 0 ? (
        <div className="empty-state">{t('circles.empty')}</div>
      ) : (
        circles.map((circle) => (
          <CircleCard key={circle.id} circle={circle} circles={circles} onChange={reload} onError={setError} />
        ))
      )}
    </div>
  );
}

function RequestsInbox({
  requests,
  circles,
  onChange,
}: {
  requests: IncomingRequest[];
  circles: Circle[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  // A Sentinel-initiated request never carries its own circle — "Me" picks
  // one from their own (real) circles when approving.
  const assignableCircles = circles.filter((c) => c.circleType !== 'RESERVED');
  const [choice, setChoice] = useState<Record<string, string>>({});

  if (requests.length === 0) return null;

  const circleFor = (requestId: string) => choice[requestId] ?? assignableCircles[0]?.id ?? '';

  return (
    <section className="panel">
      <h2>{t('circles.requests')}</h2>
      {requests.map((r) => (
        <div key={r.id} className="row">
          <span>{t('circles.requestFrom', { who: r.linkAsSentinel.firstName })}</span>
          <span className="row-actions">
            <select
              value={circleFor(r.id)}
              onChange={(e) => setChoice((prev) => ({ ...prev, [r.id]: e.target.value }))}
            >
              {assignableCircles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              disabled={!circleFor(r.id)}
              onClick={() => acceptMembership(r.id, circleFor(r.id)).then(onChange)}
            >
              {t('circles.approve')}
            </button>
            <button className="ghost" onClick={() => declineMembership(r.id).then(onChange)}>
              {t('circles.decline')}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function CreateCircleForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createCircle(label.trim());
      setLabel('');
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <h2>{t('circles.newCircle')}</h2>
      <div className="row">
        <input value={label} required placeholder={t('circles.namePlaceholder')} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={submitting || !label.trim()}>
          {t('circles.create')}
        </button>
      </div>
    </form>
  );
}

function CircleCard({
  circle,
  circles,
  onChange,
  onError,
}: {
  circle: Circle;
  circles: Circle[];
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();

  const del = async () => {
    if (!window.confirm(t('circles.confirmDelete'))) return;
    try {
      await deleteCircle(circle.id);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const isPrimary = circle.circleType === 'FIRST';

  return (
    <section className="panel">
      <div className="row">
        <h2>
          {circle.label}{' '}
          {isPrimary && <span className="badge status-accepted">{t('circles.firstCircle')}</span>}
        </h2>
        {!isPrimary && (
          <button className="ghost" onClick={del}>
            {t('common.delete')}
          </button>
        )}
      </div>

      <h3>{t('circles.members')}</h3>
      {circle.userSentinels.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('circles.noMembers')}</p>
      ) : (
        circle.userSentinels.map((m) => (
          <MemberRow key={m.id} m={m} circles={circles} onChange={onChange} onError={onError} />
        ))
      )}

      <InviteForm circleId={circle.id} isPrimary={isPrimary} onChange={onChange} onError={onError} />
    </section>
  );
}

function MemberRow({
  m,
  circles,
  onChange,
  onError,
}: {
  m: Membership;
  circles: Circle[];
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

  const proposedCircleLabel = m.proposedCircleId
    ? circles.find((c) => c.id === m.proposedCircleId)?.label
    : null;

  return (
    <div className="row member-row">
      <span>
        {m.linkAsSentinel.firstName}
        <span className={`badge status-${m.status.toLowerCase()}`}>{t(`sentinel.status.${m.status}`)}</span>
        <span className="badge">{t(`sentinel.type.${m.sentinelType}`)}</span>
        {m.leadSlot && <span className="badge">{t('sentinel.leadSentinel')}</span>}
        {proposedCircleLabel && (
          <span className="badge">{t('circles.awaitingFirstCircleConsent')}</span>
        )}
      </span>
      <span className="row-actions">
        {otherCircles.length > 0 && (
          <>
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
          </>
        )}
        <button className="ghost" onClick={remove}>
          {t('circles.removeMember')}
        </button>
      </span>
    </div>
  );
}

function InviteForm({
  circleId,
  isPrimary,
  onChange,
  onError,
}: {
  circleId: string;
  isPrimary: boolean;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [requestedAsLead, setRequestedAsLead] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await inviteSentinel(circleId, {
        phone: phone.trim(),
        name: name.trim(),
        requestedAsLead: isPrimary ? requestedAsLead : undefined,
      });
      setPhone('');
      setName('');
      setRequestedAsLead(false);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="inline-form invite-form" onSubmit={submit}>
      <h3>{t('circles.invite')}</h3>
      {isPrimary && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.4rem' }}>{t('circles.invitePrimaryHint')}</p>}
      <div className="row wrap">
        <input type="tel" required placeholder={t('circles.invitePhone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input required placeholder={t('circles.inviteName')} value={name} onChange={(e) => setName(e.target.value)} />
        {isPrimary && (
          <label className="check">
            <input
              type="checkbox"
              checked={requestedAsLead}
              onChange={(e) => setRequestedAsLead(e.target.checked)}
            />
            {t('sentinel.leadSentinel')}
          </label>
        )}
        <button type="submit" disabled={submitting || !phone.trim() || !name.trim()}>
          {t('circles.sendInvite')}
        </button>
      </div>
    </form>
  );
}
