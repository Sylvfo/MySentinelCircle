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
  updateCircle,
  updateMembership,
  type Circle,
  type Group,
  type GroupInvitation,
  type IncomingRequest,
} from '../api/sentinel';
import { Tile } from '../components/Tile';
import { Modal } from '../components/Modal';
import { CircleRing } from '../components/CircleRing';
import { useAuth } from '../auth/AuthContext';
import { SecurityScoreBar } from '../components/SecurityScoreBar';
import { PENDING_AVATAR_COLOR, PRIMARY_AVATAR_COLOR, circlePalette } from '../theme';
import { PersonAvatar } from '../components/PersonAvatar';

// Soft guidance only — nothing stops a circle from growing past this, it
// just starts showing a "that's a lot" hint on the invite form. Group
// circles (e.g. a choir) get a higher threshold since they're expected to
// be bigger than a personal circle.
const LARGE_CIRCLE_THRESHOLD = 10;
// Hard cap enforced by the backend: a 1st circle handles an alert together.
const FIRST_CIRCLE_MAX = 6;
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
  // Sentinels parked in the reserve (e.g. from a deleted circle): still
  // linked, but in no circle — shown below the rings so they aren't lost.
  const reserveMembers = circles
    .filter((c) => c.circleType === 'RESERVED')
    .flatMap((c) => c.userSentinels.filter((m) => m.status === 'ACCEPTED' || m.status === 'PENDING'));
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
              showNames
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
                  alertChatWithFirstCircle={c.alertChatWithFirstCircle}
                  colorIndex={i}
                  size={210}
                  isGroup={c.circleType === 'GROUP'}
                  showNames={c.circleType !== 'GROUP'}
                  inAlertUserIds={inAlertUserIds}
                  onOpen={() => navigate(`/circles/${c.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {reserveMembers.length > 0 && (
        <section className="reserve-section">
          <h2>{t('circles.reserve.title')}</h2>
          <p className="form-hint">{t('circles.reserve.hint')}</p>
          <ul className="reserve-list">
            {reserveMembers.map((m) => (
              <li key={m.id}>
                <Link to={`/people/${m.linkAsSentinel.id}?from=sentinel`}>
                  <PersonAvatar
                    userId={m.linkAsSentinel.id}
                    avatarPath={m.linkAsSentinel.avatarPath}
                    sentinelColor={PENDING_AVATAR_COLOR}
                    companionColor={null}
                    size={44}
                    photoRing={PENDING_AVATAR_COLOR}
                  />
                  <span>{m.linkAsSentinel.firstName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
  const navigate = useNavigate();

  // Deleting a circle never breaks a link: its Sentinels move to the
  // reserve circle (backend deleteCircle), confirmed in a real dialog first.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const del = async () => {
    setConfirmingDelete(false);
    try {
      await deleteCircle(circle.id);
      onChange();
      navigate('/circles');
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

  // "During an alert, may write to my 1st circle" is one rule for the whole
  // circle. My general switch (Settings) wins: when it's off, nobody can,
  // whatever this circle says.
  const { user } = useAuth();
  const generalAlertChatOn = user?.alertChatWithFirstCircle ?? true;
  const toggleAlertChat = async () => {
    try {
      await updateCircle(circle.id, { alertChatWithFirstCircle: !circle.alertChatWithFirstCircle });
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };

  // What the side panel shows: nothing yet, or the invite form ("+").
  // Tapping an avatar opens that person's page instead (PersonPage), where
  // every action on them lives.
  const [panel, setPanel] = useState<'add' | null>(null);

  return (
    <div className="circle-detail">
      {confirmingDelete && (
        <Modal title={t('circles.deleteCircle.title', { circle: circle.label })} onClose={() => setConfirmingDelete(false)}>
          <p className="delete-circle-warning">⚠️ {t('circles.deleteCircle.warning')}</p>
          {liveMembers.length > 0 && (
            <p>{t('circles.deleteCircle.toReserve', { count: liveMembers.length })}</p>
          )}
          <div className="row">
            <button className="danger" onClick={del}>
              {t('circles.deleteCircle.confirm')}
            </button>
            <button className="ghost" onClick={() => setConfirmingDelete(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
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
        ) : null}
      </div>

      <div className="circle-detail-ring">
        <CircleRing
          label={circle.label}
          members={liveMembers}
          isPrimary={isPrimary}
          alertChatWithFirstCircle={circle.alertChatWithFirstCircle}
          colorIndex={colorIndex}
          size={300}
          showNames
          showPhotos
          inAlertUserIds={inAlertUserIds}
          onSelectMember={(m) => navigate(`/people/${m.linkAsSentinel.id}?from=sentinel`)}
          isGroup={!!group}
        />
        {/* Under the ring: delete on the left (not for the 1st circle or a
            group), add on the right. */}
        <div className="circle-ring-actions">
          {!group && !isPrimary ? (
            <button type="button" className="ghost danger" onClick={() => setConfirmingDelete(true)}>
              {t('circles.deleteCircle.button')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="circle-add-btn"
            disabled={isPrimary && liveMembers.length >= FIRST_CIRCLE_MAX}
            onClick={() => setPanel('add')}
          >
            + {group ? t('groups.addMember') : t('circles.addSentinel')}
          </button>
        </div>
      </div>
      <div className="circle-detail-side">
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
        ) : (
          liveMembers.length === 0 && <p style={{ color: 'var(--text-muted)' }}>{t('circles.noMembers')}</p>
        )}

        {/* Alert-time chat with my 1st circle, for the whole circle. */}
        {!isPrimary && !group && (
          <section className="circle-messaging">
            <h3>{t('circles.messaging.title')}</h3>
            <label className="circle-messaging-row">
              <input
                type="checkbox"
                checked={generalAlertChatOn && circle.alertChatWithFirstCircle}
                disabled={!generalAlertChatOn}
                onChange={toggleAlertChat}
              />
              <span>
                <strong>{t('circles.messaging.duringAlert')}</strong>
                <small>{t('circles.messaging.duringAlertHint')}</small>
                {!generalAlertChatOn && (
                  <small>
                    {t('circles.messaging.generalOff')} <Link to="/settings">{t('circles.messaging.openSettings')}</Link>
                  </small>
                )}
              </span>
            </label>
          </section>
        )}

        {isPrimary ? (
          liveMembers.length >= FIRST_CIRCLE_MAX && (
            <p className="form-hint">{t('circles.firstCircleFull', { max: FIRST_CIRCLE_MAX })}</p>
          )
        ) : (
          liveMembers.length >= LARGE_CIRCLE_THRESHOLD && (
            <p className="form-hint">{t('circles.largeCircleWarning', { count: liveMembers.length })}</p>
          )
        )}
      </div>
    </div>
  );
}

// A Sentinel only ever belongs to one circle of mine (one LinkSentinels per
// pair), so "adding" someone from another circle means moving them here —
// the same update as SentinelActions' move (into the 1st circle it goes through
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
