import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { listAlerts } from '../api/alert';
import {
  acceptGroupInvitation,
  acceptMembership,
  declineGroupInvitation,
  declineMembership,
  deleteCircle,
  deleteGroup,
  inviteSentinel,
  inviteToGroup,
  leaveGroup,
  listCircles,
  listCompanions,
  listIncomingRequests,
  listMyGroupInvitations,
  listMyGroups,
  removeMembership,
  updateCircle,
  updateMembership,
  type Circle,
  type Group,
  type GroupInvitation,
  type IncomingRequest,
  type Membership,
  type MessagingMode,
} from '../api/sentinel';
import { Tile } from '../components/Tile';
import { CircleRing } from '../components/CircleRing';
import { SecurityScoreBar } from '../components/SecurityScoreBar';
import { PRIMARY_AVATAR_COLOR, circlePalette } from '../theme';

// Soft guidance only — nothing stops a circle from growing past this, it
// just starts showing a "that's a lot" hint on the invite form. Group
// circles (e.g. a choir) get a higher threshold since they're expected to
// be bigger than a personal circle.
const LARGE_CIRCLE_THRESHOLD = 10;
const LARGE_GROUP_THRESHOLD = 30;

interface GroupContact {
  userId: string;
  label: string;
}

export function CirclesPage() {
  const { t } = useTranslation();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([]);
  const [groupContacts, setGroupContacts] = useState<GroupContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // /circles/:circleId shows one circle's detail (members, actions) instead
  // of the overview — the overview itself is only rings to click.
  const { circleId } = useParams();
  const navigate = useNavigate();
  const [scoreRefresh, setScoreRefresh] = useState(0);
  // Sentinels who are themselves the subject of an alert still in progress
  // (only alerts I take part in, so this reveals nothing new): drawn red.
  const [inAlertUserIds, setInAlertUserIds] = useState<Set<string>>(new Set());

  const reload = async () => {
    setError(null);
    try {
      const [c, r, g, gi, companions, alerts] = await Promise.all([
        listCircles(),
        listIncomingRequests(),
        listMyGroups(),
        listMyGroupInvitations(),
        listCompanions(),
        listAlerts(),
      ]);
      setInAlertUserIds(
        new Set(alerts.filter((a) => a.alertStatus !== 'RESOLVED').map((a) => a.userCompanionId)),
      );
      setCircles(c);
      setScoreRefresh((n) => n + 1);
      setRequests(r);
      setGroups(g);
      setGroupInvitations(gi);

      // Who I can invite into a group circle — anyone I already have an
      // accepted Sentinel/Companion link with (mirrors the eligibility
      // rule the backend enforces), merged by userId the same way
      // MessagesPage merges its own contact list.
      const bySentinel: GroupContact[] = c.flatMap((circle) =>
        circle.userSentinels
          .filter((m) => m.status === 'ACCEPTED' && m.sentinelType !== 'ONLY_SMS')
          .map((m) => ({ userId: m.linkAsSentinel.id, label: m.linkAsSentinel.firstName })),
      );
      const byCompanion: GroupContact[] = companions.map((comp) => ({
        userId: comp.companion.id,
        label: comp.companion.email ?? comp.companion.phone ?? '…',
      }));
      const merged = new Map<string, GroupContact>();
      for (const contact of [...bySentinel, ...byCompanion]) merged.set(contact.userId, contact);
      setGroupContacts([...merged.values()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  // The 1st circle always stays pinned at the top (per plan.txt, there's
  // exactly one); everything else — excluding the system reserve circle,
  // which isn't a "real" circle to visualize — sits below it in a loose,
  // staggered row. Clicking a ring opens that circle's own detail view.
  const primaryCircle = circles.find((c) => c.circleType === 'FIRST');
  const otherCircles = circles.filter((c) => c.circleType !== 'FIRST' && c.circleType !== 'RESERVED');
  const liveMembersOf = (c: Circle) => c.userSentinels.filter((m) => m.status === 'ACCEPTED' || m.status === 'PENDING');

  if (circleId) {
    const circle = circles.find((c) => c.id === circleId);
    // Unknown id, or the circle was just deleted from its own detail view.
    if (!circle) return <Navigate to="/circles" replace />;
    const colorIndex = Math.max(0, otherCircles.findIndex((c) => c.id === circle.id));
    return (
      <div className="page-bleed">
        <Link to="/circles">{t('circles.backToCircles')}</Link>
        {error && <p className="form-error">{error}</p>}
        <CircleCard
          key={circle.id}
          circle={circle}
          circles={circles}
          colorIndex={colorIndex}
          inAlertUserIds={inAlertUserIds}
          group={groups.find((g) => g.rootId === (circle.groupRootId ?? circle.id))}
          groupContacts={groupContacts}
          onChange={reload}
          onError={setError}
        />
      </div>
    );
  }

  return (
    <div className="page-bleed sticky-header-page">
      {/* Stays put while only the circles below scroll. */}
      <div className="sticky-header">
        <h1>{t('circles.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('circles.intro')}</p>
        {error && <p className="form-error">{error}</p>}

        {/* Compact, no tile: just a caption over the bar and what's missing. */}
        <div className="security-score-compact">
          <h2>{t('securityScore.title')}</h2>
          <SecurityScoreBar refreshKey={scoreRefresh} />
        </div>

        {/* Right under the score, stacked on the right. */}
        <div className="header-actions">
          <Link to="/circles/new" className="button-link">
            {t('circles.newCircle')}
          </Link>
          <Link to="/circles/new-group" className="button-link">
            {t('groups.newGroup')}
          </Link>
        </div>
      </div>

      <RequestsInbox requests={requests} circles={circles} onChange={reload} />

      {circles.length === 0 && <div className="empty-state">{t('circles.empty')}</div>}
      <div className="circles-overview">
        {/* 1st circle always on top, nudged left. */}
        <div className="circles-primary-row">
          {primaryCircle && (
            <CircleRing
              label={primaryCircle.label}
              members={liveMembersOf(primaryCircle)}
              isPrimary
              colorIndex={0}
              size={260}
              inAlertUserIds={inAlertUserIds}
              onOpen={() => navigate(`/circles/${primaryCircle.id}`)}
            />
          )}
        </div>
        {otherCircles.length > 0 && (
          <div className="circles-other-row">
            {otherCircles.map((c, i) => (
              <div key={c.id}>
                <CircleRing
                  label={c.label}
                  members={liveMembersOf(c)}
                  isPrimary={false}
                  colorIndex={i}
                  size={210}
                  isGroup={c.circleType === 'GROUP'}
                  inAlertUserIds={inAlertUserIds}
                  onOpen={() => navigate(`/circles/${c.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Groups open from their own (double) ring above; only pending
          invitations are listed here. */}
      <GroupInvitationsInbox invitations={groupInvitations} onChange={reload} />
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
    <Tile title={t('circles.requests')}>
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
    </Tile>
  );
}

function CircleCard({
  circle,
  circles,
  colorIndex,
  inAlertUserIds,
  group,
  groupContacts,
  onChange,
  onError,
}: {
  circle: Circle;
  circles: Circle[];
  colorIndex: number;
  inAlertUserIds: Set<string>;
  // Set when this is my side of a group circle: the page then manages the
  // group (invite, leave/delete) instead of a plain circle.
  group?: Group;
  groupContacts: GroupContact[];
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
  // Removed/declined/blocked links stay in the DB (never hard-deleted) but
  // don't belong in the active member list — re-adding someone just means
  // inviting their phone number again via the "+" form, which reactivates
  // their existing link (see backend's createOrReactivateLink).
  const liveMembers = circle.userSentinels.filter(
    (m) => m.status === 'ACCEPTED' || m.status === 'PENDING',
  );

  // null resolves to "allowed" (inherits the companion's default) unless
  // explicitly set to false.
  const circleCanMessage = circle.canMessageMe !== false;
  const toggleCircleCanMessage = async () => {
    try {
      await updateCircle(circle.id, { canMessageMe: !circleCanMessage });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  // What the side panel shows: nothing picked yet, the invite form ("+"),
  // or one Sentinel's actions (tapping their avatar on the ring).
  const [panel, setPanel] = useState<'add' | string | null>(null);
  const selectedMember = liveMembers.find((m) => m.id === panel) ?? null;

  return (
    <div className="circle-detail">
      <div className="circle-detail-ring">
        <CircleRing
          label={circle.label}
          members={liveMembers}
          isPrimary={isPrimary}
          colorIndex={colorIndex}
          size={300}
          showNames
          inAlertUserIds={inAlertUserIds}
          selectedMemberId={selectedMember?.id ?? null}
          onSelectMember={(m) => setPanel(m.id)}
          isGroup={!!group}
        />
        <button type="button" className="circle-add-btn" onClick={() => setPanel('add')}>
          + {group ? t('groups.addMember') : t('circles.addSentinel')}
        </button>
      </div>
      <div className="circle-detail-side">
        <div className="circle-detail-head">
          {group && <span className="circle-detail-eyebrow">{t('groups.eyebrow')}</span>}
          <h2>
            <span
              className="circle-dot"
              style={{ background: isPrimary ? PRIMARY_AVATAR_COLOR : circlePalette(colorIndex).color }}
            />
            {circle.label}
            {isPrimary && <span className="badge status-accepted">{t('circles.firstCircle')}</span>}
          </h2>
          {group ? (
            <GroupActions group={group} onChange={onChange} onError={onError} />
          ) : (
            !isPrimary && (
              <div className="tile-actions">
                <button className="ghost" onClick={toggleCircleCanMessage}>
                  {circleCanMessage ? t('circles.blockMessaging') : t('circles.allowMessaging')}
                </button>
                <button className="ghost" onClick={del}>
                  {t('common.delete')}
                </button>
              </div>
            )
          )}
        </div>

        {panel === 'add' && group ? (
          <Tile>
            <GroupInviteForm group={group} contacts={groupContacts} onChange={onChange} onError={onError} />
            <div className="member-panel-close">
              <button className="ghost" onClick={() => setPanel(null)}>
                {t('common.close')}
              </button>
            </div>
          </Tile>
        ) : panel === 'add' ? (
          <Tile>
            <AddFromOtherCircle
              circle={circle}
              circles={circles}
              onChange={() => {
                onChange();
                setPanel(null);
              }}
              onError={onError}
            />
            <InviteForm
              circleId={circle.id}
              isPrimary={isPrimary}
              onChange={() => {
                onChange();
                setPanel(null);
              }}
              onError={onError}
            />
            <div className="member-panel-close">
              <button className="ghost" onClick={() => setPanel(null)}>
                {t('common.close')}
              </button>
            </div>
          </Tile>
        ) : selectedMember ? (
          <Tile>
            <MemberPanel
              key={selectedMember.id}
              m={selectedMember}
              circles={circles}
              isPrimary={isPrimary}
              onChange={onChange}
              onError={onError}
            />
            <div className="member-panel-close">
              <button className="ghost" onClick={() => setPanel(null)}>
                {t('common.close')}
              </button>
            </div>
          </Tile>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>
            {liveMembers.length === 0 ? t('circles.noMembers') : t('circles.tapHint')}
          </p>
        )}

        {liveMembers.length >= LARGE_CIRCLE_THRESHOLD && (
          <p className="form-hint">{t('circles.largeCircleWarning', { count: liveMembers.length })}</p>
        )}
      </div>
    </div>
  );
}

// One Sentinel's actions, shown beside the ring once their avatar is tapped.
function MemberPanel({
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
      <h3>
        {m.linkAsSentinel.firstName} {m.linkAsSentinel.lastName}
      </h3>
      {m.linkAsSentinel.phone && <p className="member-panel-phone">{m.linkAsSentinel.phone}</p>}
      <div className="member-panel-badges">
        <span className={`badge status-${m.status.toLowerCase()}`}>{t(`sentinel.status.${m.status}`)}</span>
        <span className="badge">{t(`sentinel.type.${m.sentinelType}`)}</span>
        {m.leadSlot && <span className="badge">{t('sentinel.leadSentinel')}</span>}
        {proposedCircleLabel && <span className="badge">{t('circles.awaitingFirstCircleConsent')}</span>}
      </div>
      {/* A Sentinel SMS has no account, so no in-app conversation to open. */}
      {m.status === 'ACCEPTED' && m.sentinelType !== 'ONLY_SMS' && (
        <Link to={`/messages/${m.linkAsSentinel.id}`} className="button-link member-panel-message">
          {t('companions.sendMessage', { name: m.linkAsSentinel.firstName })}
        </Link>
      )}
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

// A Sentinel only ever belongs to one circle of mine (one LinkSentinels per
// pair), so "adding" someone from another circle means moving them here —
// the same update as MemberPanel's move (into the 1st circle it goes through
// their consent first, see awaitingFirstCircleConsent).
function AddFromOtherCircle({
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
  const candidates = circles
    .filter((c) => c.id !== circle.id)
    .flatMap((c) =>
      c.userSentinels
        .filter((m) => m.status === 'ACCEPTED' || m.status === 'PENDING')
        .map((m) => ({ m, circleLabel: c.label })),
    );
  const [membershipId, setMembershipId] = useState(candidates[0]?.m.id ?? '');
  const [submitting, setSubmitting] = useState(false);

  if (candidates.length === 0) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateMembership(membershipId, { circleId: circle.id });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="inline-form add-from-circle" onSubmit={submit}>
      <h3>{t('circles.addFromOtherCircle')}</h3>
      <div className="row wrap">
        <select value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
          {candidates.map(({ m, circleLabel }) => (
            <option key={m.id} value={m.id}>
              {m.linkAsSentinel.firstName} ({circleLabel})
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting || !membershipId}>
          {t('circles.moveHere')}
        </button>
      </div>
    </form>
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

// ---- Group circles (mutual mesh, invite-by-connection only) -----------------

function GroupInvitationsInbox({
  invitations,
  onChange,
}: {
  invitations: GroupInvitation[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  if (invitations.length === 0) return null;

  return (
    <Tile title={t('groups.invitations')}>
      {invitations.map((inv) => (
        <div key={inv.id} className="row">
          <span>
            {t('groups.invitedBy', { who: inv.invitedBy.firstName, group: inv.groupRoot.label })}
          </span>
          <span className="row-actions">
            <button onClick={() => acceptGroupInvitation(inv.id).then(onChange)}>
              {t('groups.accept')}
            </button>
            <button className="ghost" onClick={() => declineGroupInvitation(inv.id).then(onChange)}>
              {t('groups.decline')}
            </button>
          </span>
        </div>
      ))}
    </Tile>
  );
}

// A group circle's own actions, in its page header: the founder can delete
// the whole group, everyone else can only leave it.
function GroupActions({
  group,
  onChange,
  onError,
}: {
  group: Group;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();

  const leave = async () => {
    if (!window.confirm(t('groups.confirmLeave'))) return;
    try {
      await leaveGroup(group.rootId);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const remove = async () => {
    if (!window.confirm(t('groups.confirmDelete'))) return;
    try {
      await deleteGroup(group.rootId);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <div className="tile-actions">
      {group.isFounder ? (
        <button className="ghost" onClick={remove}>
          {t('groups.delete')}
        </button>
      ) : (
        <button className="ghost" onClick={leave}>
          {t('groups.leave')}
        </button>
      )}
    </div>
  );
}

// The group circle page's "+": invite someone I'm already connected to.
function GroupInviteForm({
  group,
  contacts,
  onChange,
  onError,
}: {
  group: Group;
  contacts: GroupContact[];
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const memberIds = new Set(group.members.map((m) => m.id));
  const eligible = contacts.filter((c) => !memberIds.has(c.userId));
  const [targetUserId, setTargetUserId] = useState(eligible[0]?.userId ?? '');
  const [invited, setInvited] = useState<string | null>(null);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;
    setInvited(null);
    try {
      const invitedLabel = eligible.find((c) => c.userId === targetUserId)?.label ?? '';
      await inviteToGroup(group.rootId, targetUserId);
      setInvited(invitedLabel);
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <form className="inline-form" onSubmit={invite}>
      <h3>{t('groups.addMember')}</h3>
      {group.members.length >= LARGE_GROUP_THRESHOLD && (
        <p className="form-hint">{t('groups.largeGroupWarning', { count: group.members.length })}</p>
      )}
      {eligible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('groups.noEligibleContacts')}</p>
      ) : (
        <div className="row wrap">
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
            {eligible.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!targetUserId}>
            {t('groups.invite')}
          </button>
        </div>
      )}
      {invited && <p className="form-hint">{t('groups.invitedSent', { who: invited })}</p>}
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('groups.eligibilityHint')}</p>
    </form>
  );
}
