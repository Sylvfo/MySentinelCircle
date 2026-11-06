import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { alertNeedsMe, getMyParticipation, listAlerts, type MyAlertSummary, type MyParticipation } from '../api/alert';
import { replyLabel } from '../components/replyLabel';
import { firstCircleAskKey } from '../alertAsk';
import { listCircles, listCompanions, type Circle, type Companion } from '../api/sentinel';
import { Tile } from '../components/Tile';
import { SecurityScoreBar } from '../components/SecurityScoreBar';
import { SentinelIcon } from '../components/SentinelIcon';
import { CompanionIcon } from '../components/CompanionIcon';
import { CircleRing } from '../components/CircleRing';
import { companionColor, companionGold } from '../theme';

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<MyAlertSummary[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // alertId -> first name of the person each running alert is about.
  const [aboutNames, setAboutNames] = useState<Record<string, string>>({});
  // alertId -> my own participation (my answer, the questions put to me),
  // to say on the tile exactly what is asked of me.
  const [mine, setMine] = useState<Record<string, MyParticipation>>({});

  useEffect(() => {
    Promise.all([listAlerts(), listCircles(), listCompanions()])
      .then(([a, c, comp]) => {
        setAlerts(a);
        setCircles(c);
        setCompanions(comp);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  // Normal vs Alert mode: a "Running Alert" card takes over the top whenever
  // an active alert needs this viewer to act (see alertNeedsMe). The red
  // background itself is app-wide, set by AppShell.
  const activeAlerts = alerts.filter((a) => alertNeedsMe(a, user?.id));
  const activeIds = activeAlerts.map((a) => a.id).join(',');
  // "People watching over you" counts Sentinels, not circles — sum of
  // accepted members across every real circle (the system reserve circle
  // isn't a real one to count).
  const sentinelCount = circles
    .filter((c) => c.circleType !== 'RESERVED')
    .reduce((sum, c) => sum + c.userSentinels.filter((m) => m.status === 'ACCEPTED').length, 0);

  // Same split as CirclesPage's overview, for the My Circles tile's preview.
  const primaryCircle = circles.find((c) => c.circleType === 'FIRST');
  const otherCircles = circles.filter((c) => c.circleType !== 'FIRST' && c.circleType !== 'RESERVED');
  const liveMembersOf = (c: Circle) => c.userSentinels.filter((m) => m.status === 'ACCEPTED' || m.status === 'PENDING');

  // "About" must name the companion the alert concerns, not the alert's own
  // label. Self-raised alerts need no extra call; otherwise fall back the
  // same way AlertsPage's detail panel does (an outer-circle Sentinel can
  // get a 403 from getAlert and needs the lighter getMyParticipation view).
  useEffect(() => {
    // My own alert: no participation, my own name. Otherwise my
    // participation carries both the name and what's asked of me.
    void Promise.all(
      activeAlerts.map(async (a) => {
        if (a.userCompanionId === user?.id) return [a.id, user?.firstName ?? null, null] as const;
        try {
          const p = await getMyParticipation(a.id);
          return [a.id, p.alert.userCompanion.firstName, p] as const;
        } catch {
          return [a.id, null, null] as const;
        }
      }),
    ).then((rows) => {
      const names: Record<string, string> = {};
      const parts: Record<string, MyParticipation> = {};
      for (const [id, n, p] of rows) {
        if (n) names[id] = n;
        if (p) parts[id] = p;
      }
      setAboutNames(names);
      setMine(parts);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, user?.id]);

  // In one sentence, what this alert asks of me right now.
  const askOf = (a: MyAlertSummary): string => {
    const name = aboutNames[a.id] ?? '';
    if (a.userCompanionId === user?.id) return t('dashboard.runningAlert.ask.mine');
    const p = mine[a.id];
    if (!p) return t('dashboard.runningAlert.ask.generic');
    if (p.alert.alertStatus === 'CLOSING') return t('dashboard.runningAlert.ask.found', { name });
    const isFirstCircle = a.myParticipation?.circleId === a.firstCircleId;
    if (isFirstCircle) {
      if (!p.response) return t(`alerts.ask.${firstCircleAskKey(a.alertType)}`, { name });
      if (p.response === 'GOING') return t('dashboard.runningAlert.ask.going');
      return t('dashboard.runningAlert.ask.answered', { reply: replyLabel(t, p.response) });
    }
    const open = p.questions.find((q) => !q.response);
    if (open) return t('dashboard.runningAlert.ask.question', { name, question: t(`alerts.questions.${open.kind}`) });
    return t('dashboard.runningAlert.ask.thanks');
  };

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  return (
    // has-alert: the Running Alert tile takes the room, My Circles / My
    // Companions shrink to compact headers, Raise Alert stays reachable.
    <div className={`dashboard${activeAlerts.length > 0 ? ' has-alert' : ''}`}>
      <header className="dashboard-greeting">
        <h1>{t('dashboard.greeting.hello', { name: user?.firstName ?? '' })}</h1>
      </header>

      {error && <p className="form-error">{error}</p>}

      {/* Every tile is a link as a whole — no separate "Open" button. One
          Running Alert tile per alert in progress, one under the other. */}
      {activeAlerts.map((a) => (
        <Link key={a.id} to={`/running-alert/${a.id}`} className="tile-link">
          <Tile className="alert-active tile-running" title={t('dashboard.runningAlert.title')}>
            <p>
              <strong>{t('dashboard.runningAlert.about')}</strong> {aboutNames[a.id] ?? a.label}
            </p>
            <p className="running-ask">{askOf(a)}</p>
            <p className="running-open">{t('dashboard.runningAlert.open')} ›</p>
          </Tile>
        </Link>
      ))}

      <div className="tile-grid">
        <Link to="/circles" className="tile-link">
          <Tile
            className="tile-dash tile-circles"
            title={
              <div>
                <h2>{t('dashboard.circles')}</h2>
                <p className="tile-subtitle">{t('dashboard.circlesSubtitle')}</p>
              </div>
            }
            actions={
              <span className="tile-count sentinel" aria-label={t('dashboard.circlesHint', { count: sentinelCount })}>
                <SentinelIcon size={24} />
                {sentinelCount}
              </span>
            }
          >
            <SecurityScoreBar barOnly />
            {/* Cropped glimpse of the rings: the tile's height (which follows
                the phone's) decides how much of them shows. */}
            <div className="dash-preview circles-preview" aria-hidden="true">
              {primaryCircle && (
                <div className="preview-ring primary">
                  <CircleRing
                    label={primaryCircle.label}
                    members={liveMembersOf(primaryCircle)}
                    isPrimary
                    colorIndex={0}
                    size={170}
                    showNames
                    strongRing
                  />
                </div>
              )}
              {otherCircles[0] && (
                <div className="preview-ring other">
                  <CircleRing
                    label={otherCircles[0].label}
                    members={liveMembersOf(otherCircles[0])}
                    isPrimary={false}
                    alertChatWithFirstCircle={otherCircles[0].alertChatWithFirstCircle}
                    colorIndex={0}
                    size={140}
                    isGroup={otherCircles[0].circleType === 'GROUP'}
                    showNames={otherCircles[0].circleType !== 'GROUP'}
                    strongRing
                  />
                </div>
              )}
              {otherCircles[1] && (
                <div className="preview-ring third">
                  <CircleRing
                    label={otherCircles[1].label}
                    members={liveMembersOf(otherCircles[1])}
                    isPrimary={false}
                    alertChatWithFirstCircle={otherCircles[1].alertChatWithFirstCircle}
                    colorIndex={1}
                    size={140}
                    isGroup={otherCircles[1].circleType === 'GROUP'}
                    showNames={otherCircles[1].circleType !== 'GROUP'}
                    strongRing
                  />
                </div>
              )}
            </div>
          </Tile>
        </Link>
        <Link to="/companions" className="tile-link">
          <Tile
            className="tile-dash tile-companions"
            title={
              <div>
                <h2>{t('dashboard.companions')}</h2>
                <p className="tile-subtitle">{t('dashboard.companionsSubtitle')}</p>
              </div>
            }
            actions={
              <span className="tile-count" aria-label={t('dashboard.companionsHint', { count: companions.length })}>
                <CompanionIcon size={26} />
                {companions.length}
              </span>
            }
          >
            <div className="dash-preview companions-preview" aria-hidden="true">
              {companions.slice(0, 3).map((c) => (
                <div key={c.linkId} className="preview-companion">
                  <CompanionIcon
                    size={64}
                    color={companionColor(c.companion.id)}
                    leadColor={companionGold(!!c.leadSlot, c.circle.isPrimary)}
                  />
                  <span className="companion-name">{c.companion.firstName}</span>
                </div>
              ))}
            </div>
          </Tile>
        </Link>
      </div>

      {/* Last item of the full-height column: always at the bottom of the
          screen, just above the mobile bottom nav. */}
      <Link to="/alerts" className="raise-alert-btn">
        <span className="raise-alert-title">{t('dashboard.raiseAlert')}</span>
        <span className="raise-alert-hint">{t('dashboard.raiseAlertHint')}</span>
      </Link>
    </div>
  );
}
