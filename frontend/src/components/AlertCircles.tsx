import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  ALERT_QUESTION_KINDS,
  askQuestion,
  requestCircle,
  type AlertDetail,
  type AlertParticipant,
  type AlertQuestionKind,
} from '../api/alert';
import { replyLabel } from './replyLabel';
import { LinkifiedText } from './LinkifiedText';

// The companion's other circles during an alert (the 1st circle has its own
// room): one tile per circle with its people, whether it was asked, and
// what the 1st circle can do with it right there — ask for help, ask a
// further question, contact more of its members.

function QuestionSelect({ value, onChange }: { value: AlertQuestionKind; onChange: (k: AlertQuestionKind) => void }) {
  const { t } = useTranslation();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AlertQuestionKind)}>
      {ALERT_QUESTION_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {t(`alerts.questions.${kind}`)}
        </option>
      ))}
    </select>
  );
}

// Answered / asked and waiting / left / not contacted yet (WAITING: next
// batch of the circle, see requestCircle).
function dotOf(p: AlertParticipant): string {
  if (p.status === 'CLOSED') return 'left';
  if (p.response) return 'answered';
  if (p.status === 'WAITING') return 'notYet';
  return 'waiting';
}

export function AlertCircleTiles({
  detail,
  canAct,
  onChange,
}: {
  detail: AlertDetail;
  canAct: boolean;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const circles = detail.userCompanion.myCircles.filter((c) => c.id !== detail.firstCircleId);
  if (circles.length === 0) return <p className="form-hint">{t('alerts.circlesView.none')}</p>;

  return (
    <div className="alert-circle-tiles">
      {circles.map((c) => (
        <CircleTile
          key={c.id}
          alertId={detail.id}
          circle={c}
          members={detail.participants.filter((p) => p.circleId === c.id)}
          canAct={canAct}
          onChange={onChange}
        />
      ))}
      <p className="form-hint alert-dot-legend">
        <span className="dot answered" /> {t('alerts.circlesView.dot.answered')} · <span className="dot waiting" />{' '}
        {t('alerts.circlesView.dot.waiting')} · <span className="dot notYet" /> {t('alerts.circlesView.dot.notYet')} ·{' '}
        <span className="dot left" /> {t('alerts.circlesView.dot.left')}
      </p>
    </div>
  );
}

function CircleTile({
  alertId,
  circle,
  members,
  canAct,
  onChange,
}: {
  alertId: string;
  circle: { id: string; label: string };
  members: AlertParticipant[];
  canAct: boolean;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<'request' | 'ask' | null>(null);
  const [kind, setKind] = useState<AlertQuestionKind>('CAN_VISIT');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contacted = members.filter((p) => p.contactedAt);
  const askable = contacted.filter((p) => p.status !== 'CLOSED');
  const answered = contacted.filter((p) => p.response).length;
  const notYet = members.filter((p) => p.status === 'WAITING').length;
  const firstContact = contacted.reduce<AlertParticipant | null>(
    (a, p) => (!a || p.contactedAt! < a.contactedAt! ? p : a),
    null,
  );

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      if (form === 'ask') {
        await askQuestion(alertId, { questionKind: kind, participantIds: askable.map((p) => p.id) });
      } else {
        await requestCircle(alertId, { circleId: circle.id, questionKind: kind });
      }
      setForm(null);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const open = (next: 'request' | 'ask') => {
    setKind(next === 'ask' ? 'SEEMED_OK' : 'CAN_VISIT');
    setForm(form === next ? null : next);
  };

  return (
    <section className="alert-circle-tile">
      <div className="alert-circle-tile-head">
        <h3>{circle.label}</h3>
        <span className={`chip${firstContact ? ' on' : ''}`}>
          {firstContact
            ? t('alerts.circlesView.contactedAt', {
                time: new Date(firstContact.contactedAt!).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }),
              })
            : t('alerts.circlesView.notContacted')}
        </span>
      </div>
      {members.length > 0 && (
        <ul className="alert-circle-people">
          {members.map((p) => (
            <li key={p.id} title={t(`alerts.circlesView.dot.${dotOf(p)}`)}>
              <Link to={`/people/${p.userSentinels.linkAsSentinel.id}?alert=${alertId}`}>
                <span className={`dot ${dotOf(p)}`} aria-hidden="true" />
                {p.userSentinels.linkAsSentinel.firstName}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {firstContact && (
        <p className="form-hint">
          {t('alerts.circlesView.answeredCount', { answered, total: contacted.length })}
          {firstContact.requestedBy &&
            ` · ${t('alerts.circlesView.askedBy', { name: firstContact.requestedBy.firstName })}`}
        </p>
      )}
      {canAct && (
        <div className="row wrap">
          {!firstContact ? (
            <button onClick={() => open('request')}>{t('alerts.circlesView.requestHelp')}</button>
          ) : (
            <>
              {askable.length > 0 && (
                <button className="ghost" onClick={() => open('ask')}>
                  {t('alerts.circlesView.askQuestion')}
                </button>
              )}
              {notYet > 0 && (
                <button className="ghost" onClick={() => open('request')}>
                  {t('alerts.circlesView.contactMore', { count: notYet })}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {form && (
        <div className="alert-circle-form">
          <QuestionSelect value={kind} onChange={setKind} />
          <button onClick={send} disabled={sending}>
            {form === 'ask'
              ? t('alerts.circlesView.sendTo', { count: askable.length })
              : t('alerts.circlesView.sendRequest', { circle: circle.label })}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

// ---------- Replies: summary per circle + one timeline ----------

type Kind = 'reply' | 'action';
interface Entry {
  at: string;
  kind: Kind;
  who: string;
  text: string;
  note?: string;
}

// Same second = same click (a circle request contacts a whole batch, a
// question goes to several people at once).
const sameMoment = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;

export function AlertRepliesTimeline({ detail }: { detail: AlertDetail }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const first = detail.participants.filter((p) => p.circleId === detail.firstCircleId);
  const nameOfUser = (id: string) =>
    id === detail.userCompanion.id
      ? detail.userCompanion.firstName
      : (detail.participants.find((p) => p.userSentinels.linkAsSentinel.id === id)?.userSentinels.linkAsSentinel
          .firstName ?? '…');

  const entries: Entry[] = [];
  // Raised / responsible Lead / left / closed: from the server timeline.
  for (const e of detail.timeline) {
    if (e.type === 'CONTACTED' || e.type === 'RESPONDED') continue;
    entries.push({
      at: e.at,
      kind: 'action',
      who: e.actorLabel,
      text: t(`alerts.timelineView.${e.type}`),
      note: e.type === 'ALERT_RAISED' ? e.detail : undefined,
    });
  }
  // The person found: what the responsible Lead decided.
  if (detail.closingAt) {
    entries.push({
      at: detail.closingAt,
      kind: 'action',
      who: detail.statusUpdatedBy?.firstName ?? '',
      text: detail.statusByFirstCircle ?? t('alerts.timelineView.FOUND'),
    });
  }
  // The 1st circle's own answers.
  for (const p of first) {
    if (p.response && p.answeredAt) {
      entries.push({
        at: p.answeredAt,
        kind: 'reply',
        who: p.userSentinels.linkAsSentinel.firstName,
        text: replyLabel(t, p.response),
      });
    }
  }
  // Other circles: one "asked for help" per click, one "asked a question"
  // per click, then each answer.
  const requests: { at: string; by: string; circle: string }[] = [];
  const asks: { at: string; by: string; kind: string; count: number }[] = [];
  for (const p of detail.participants) {
    if (p.circleId === detail.firstCircleId) continue;
    if (p.contactedAt && !requests.some((r) => r.circle === p.circleName && sameMoment(r.at, p.contactedAt!))) {
      requests.push({ at: p.contactedAt, by: p.requestedBy?.firstName ?? '', circle: p.circleName });
    }
    for (const q of p.questions) {
      // The question sent with the request itself isn't a separate step.
      if (!(p.contactedAt && sameMoment(q.createdAt, p.contactedAt))) {
        const same = asks.find((a) => a.kind === q.kind && sameMoment(a.at, q.createdAt));
        if (same) same.count += 1;
        else asks.push({ at: q.createdAt, by: nameOfUser(q.askedById), kind: q.kind, count: 1 });
      }
      if (q.response && q.answeredAt) {
        entries.push({
          at: q.answeredAt,
          kind: 'reply',
          who: `${p.userSentinels.linkAsSentinel.firstName} (${p.circleName})`,
          text: q.kind === 'WHERE_SEEN' ? q.response : replyLabel(t, q.response),
          note: t(`alerts.questions.${q.kind}`),
        });
      }
    }
  }
  for (const r of requests) {
    entries.push({
      at: r.at,
      kind: 'action',
      who: r.by,
      text: t('alerts.timelineView.requested', { circle: r.circle }),
    });
  }
  for (const a of asks) {
    entries.push({
      at: a.at,
      kind: 'action',
      who: a.by,
      text: t('alerts.timelineView.asked', { count: a.count }),
      note: t(`alerts.questions.${a.kind}`),
    });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));
  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);

  // Summary: the 1st circle by answer, other circles answered / waiting.
  const countBy = (list: string[]) => {
    const m = new Map<string, number>();
    for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m];
  };
  const firstCounts = countBy(first.filter((p) => p.status !== 'CLOSED').map((p) => p.response ?? ''));
  const others = new Map<string, AlertParticipant[]>();
  for (const p of detail.participants) {
    if (p.circleId === detail.firstCircleId || !p.contactedAt) continue;
    others.set(p.circleName, [...(others.get(p.circleName) ?? []), p]);
  }

  return (
    <div className="alert-replies">
      <div className="alert-replies-summary">
        <h3>{t('alerts.timelineView.firstCircle')}</h3>
        <div className="reply-chips">
          {firstCounts.map(([code, n]) => (
            <span key={code} className={`reply-chip ${code === 'GOING' ? 'g' : code ? 'y' : 'm'}`}>
              {n} {code ? replyLabel(t, code) : t('alerts.timelineView.pending')}
            </span>
          ))}
        </div>
        {[...others].map(([name, ps]) => {
          const answered = ps.filter((p) => p.response).length;
          return (
            <div key={name}>
              <h3>{name}</h3>
              <div className="reply-chips">
                <span className="reply-chip g">{t('alerts.timelineView.answered', { count: answered })}</span>
                {ps.length - answered > 0 && (
                  <span className="reply-chip m">
                    {ps.length - answered} {t('alerts.timelineView.pending')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="seg" role="group" aria-label={t('alerts.timelineView.filter')}>
        {(['all', 'reply', 'action'] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? 'on' : undefined}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(`alerts.timelineView.show.${f}`)}
          </button>
        ))}
      </div>

      <ol className="alert-tl">
        {shown.map((e, i) => (
          <li key={i} className={e.kind}>
            <time>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
            <strong>{e.who}</strong> {e.kind === 'reply' ? <span className="ans">{e.text}</span> : e.text}
            {e.note && (
              <small className="timeline-note">
                <LinkifiedText text={e.note} />
              </small>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
