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

      <RequestsInbox requests={requests} onChange={reload} />
      <CreateCircleForm onCreated={reload} onError={setError} />

      {circles.length === 0 ? (
        <div className="empty-state">{t('circles.empty')}</div>
      ) : (
        circles.map((circle) => <CircleCard key={circle.id} circle={circle} onChange={reload} onError={setError} />)
      )}
    </div>
  );
}

function RequestsInbox({ requests, onChange }: { requests: IncomingRequest[]; onChange: () => void }) {
  const { t } = useTranslation();
  if (requests.length === 0) return null;

  return (
    <section className="panel">
      <h2>{t('circles.requests')}</h2>
      {requests.map((r) => (
        <div key={r.id} className="row">
          <span>
            {t('circles.requestFrom', { who: r.contact.name || r.contact.phone })} — {r.circle.label}
          </span>
          <span className="row-actions">
            <button onClick={() => acceptMembership(r.id).then(onChange)}>{t('circles.approve')}</button>
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

function CircleCard({ circle, onChange, onError }: { circle: Circle; onChange: () => void; onError: (m: string) => void }) {
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

  return (
    <section className="panel">
      <div className="row">
        <h2>
          {circle.label}{' '}
          {circle.isPrimary && <span className="badge status-accepted">{t('circles.firstCircle')}</span>}
        </h2>
        {!circle.isPrimary && (
          <button className="ghost" onClick={del}>
            {t('common.delete')}
          </button>
        )}
      </div>

      <h3>{t('circles.members')}</h3>
      {circle.memberships.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('circles.noMembers')}</p>
      ) : (
        circle.memberships.map((m) => <MemberRow key={m.id} m={m} onChange={onChange} onError={onError} />)
      )}

      <InviteForm circleId={circle.id} isPrimary={circle.isPrimary} onChange={onChange} onError={onError} />
    </section>
  );
}

function MemberRow({ m, onChange, onError }: { m: Membership; onChange: () => void; onError: (msg: string) => void }) {
  const { t } = useTranslation();

  const remove = async () => {
    try {
      await removeMembership(m.id);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <div className="row member-row">
      <span>
        {m.contact.name || m.contact.phone}
        <span className={`badge status-${m.status.toLowerCase()}`}>{t(`sentinel.status.${m.status}`)}</span>
        <span className="badge">{t(`sentinel.type.${m.sentinelType}`)}</span>
        {m.isReference && <span className="badge">{t('sentinel.reference')}</span>}
      </span>
      <button className="ghost" onClick={remove}>
        {t('circles.removeMember')}
      </button>
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
  const [plus, setPlus] = useState(false);
  const [isReference, setIsReference] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await inviteSentinel(circleId, {
        phone: phone.trim(),
        name: name.trim(),
        sentinelType: plus ? 'SENTINEL_PLUS' : 'SENTINEL',
        isReference: isPrimary ? isReference : undefined,
      });
      setPhone('');
      setName('');
      setPlus(false);
      setIsReference(false);
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
        <label className="check">
          <input type="checkbox" checked={plus} onChange={(e) => setPlus(e.target.checked)} />
          {t('sentinel.type.SENTINEL_PLUS')}
        </label>
        {isPrimary && (
          <label className="check">
            <input type="checkbox" checked={isReference} onChange={(e) => setIsReference(e.target.checked)} />
            {t('sentinel.reference')}
          </label>
        )}
        <button type="submit" disabled={submitting || !phone.trim() || !name.trim()}>
          {t('circles.sendInvite')}
        </button>
      </div>
    </form>
  );
}
