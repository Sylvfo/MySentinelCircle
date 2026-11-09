import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { errorText } from '../api/client';
import { listAlerts } from '../api/alert';
import {
  acceptMembership,
  declineMembership,
  listCircles,
  listCompanions,
  listIncomingRequests,
  listMyGroupInvitations,
  listMyGroups,
  type Circle,
  type Group,
  type GroupInvitation,
  type IncomingRequest,
} from '../api/sentinel';
import { Tile } from '../components/Tile';
import { CircleRing } from '../components/CircleRing';
import { useAuth } from '../auth/AuthContext';
import { PauseNotice, PausePill } from '../components/PauseNotice';
import { SecurityScoreBar } from '../components/SecurityScoreBar';
import { PENDING_AVATAR_COLOR } from '../theme';
import { PaidPill } from '../components/Upgrade';
import { IncludedStar } from '../components/SubscribedStar';
import { usePlan } from '../plan';
import { PersonAvatar } from '../components/PersonAvatar';
import { Loading } from '../components/Loading';
import { CircleCard } from '../components/CircleCard';
import { GroupInvitationsInbox, type GroupContact } from '../components/GroupPanels';

export function CirclesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { plan } = usePlan();
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
      setError(errorText(err));
    }
  };

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

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
        <h1>
          {t('circles.title')} <PausePill which="forMe" />
        </h1>
        <p className="muted">{t('circles.intro')}</p>
        <PauseNotice which="forMe" />
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
          <span className="header-action-row">
            <Link to="/circles/new-group" className="button-link">
              {t('groups.newGroup')}
              {plan?.hasPaid && <IncludedStar />}
            </Link>
            {plan && !plan.groups && <PaidPill feature="groups" />}
          </span>
        </div>
      </div>

      <RequestsInbox requests={requests} circles={circles} onChange={reload} />

      {circles.length === 0 && <div className="empty-state">{t('circles.empty')}</div>}
      {/* Greyed while I'm on pause for me: nobody watches over me now —
          still fully usable. */}
      <div className={`circles-overview${user?.pausedForMe ? ' area-paused' : ''}`}>
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
                    paused={m.linkAsSentinel.pausedForOthers}
                    subscribed={m.linkAsSentinel.subscribed}
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
