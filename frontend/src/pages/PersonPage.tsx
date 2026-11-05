import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getAlert, type AlertDetail } from '../api/alert';
import { useAuth } from '../auth/AuthContext';
import { listCircles, listCompanions, type Circle, type Companion } from '../api/sentinel';
import { PersonAvatar } from '../components/PersonAvatar';
import { SentinelActions } from '../components/SentinelActions';
import { CompanionActions } from '../components/CompanionActions';
import { avatarPathOf, myCompanionColor, mySentinelColor, publicStatusOf } from '../relations';
import { companionColor, companionGold } from '../theme';

// /people/:userId — everything about one person in one place (a "friend
// page"): who they are, then one section per direction of the relationship
// — they watch over me (my Sentinel), I watch over them (my companion) —
// each with its role explained and every action on it. The section matching
// where I came from (?from=sentinel|companion) comes first and opens; from
// Messages (or anywhere else) both are open. Built from listCircles() +
// listCompanions(): no dedicated endpoint.
type SectionKey = 'alert' | 'sentinel' | 'companion';

export function PersonPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  // Opened from an alert's detail: also show their place in that alert —
  // even with no direct link to me (then: first name only, no contact).
  const alertId = searchParams.get('alert');
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<SectionKey>>(
    () =>
      new Set<SectionKey>(
        alertId
          ? ['alert']
          : from === 'sentinel'
            ? ['sentinel']
            : from === 'companion'
              ? ['companion']
              : ['sentinel', 'companion'],
      ),
  );

  const reload = async () => {
    setError(null);
    try {
      const [c, comp, a] = await Promise.all([
        listCircles(),
        listCompanions(),
        // Only the companion and their 1st circle may read an alert's
        // detail; anyone else just gets the page without the alert part.
        alertId ? getAlert(alertId).catch(() => null) : Promise.resolve(null),
      ]);
      setCircles(c);
      setCompanions(comp);
      setAlert(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, alertId]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  // They watch over me: my membership with them, in whichever circle of mine.
  const circle = circles.find((c) => c.userSentinels.some((m) => m.linkAsSentinel.id === userId));
  const membership = circle?.userSentinels.find((m) => m.linkAsSentinel.id === userId) ?? null;
  // I watch over them.
  const companion = companions.find((c) => c.companion.id === userId) ?? null;

  // Their place in the alert I came from: a contacted Sentinel, or the
  // person the alert is about.
  const participant = alert?.participants.find((p) => p.userSentinels.linkAsSentinel.id === userId) ?? null;
  const isAlertSubject = alert?.userCompanion.id === userId;
  const inAlert = !!participant || isAlertSubject;

  // No link either way (or it just ended, e.g. I removed them from here),
  // and nothing to show from an alert either.
  if (!membership && !companion && !inAlert) return <Navigate to="/dashboard" replace />;
  const linked = !!membership || !!companion;

  // Both of us in one of this alert's chats (the 1st-circle one, or an
  // isolated one with an outer-circle Sentinel).
  const sharedAlertChat =
    alert?.conversations.some(
      (conv) =>
        !conv.closedAt &&
        conv.participants.some((p) => p.user.id === userId) &&
        conv.participants.some((p) => p.user.id === user?.id),
    ) ?? false;

  const person = {
    firstName:
      companion?.companion.firstName ??
      membership?.linkAsSentinel.firstName ??
      participant?.userSentinels.linkAsSentinel.firstName ??
      alert?.userCompanion.firstName ??
      '',
    lastName: companion?.companion.lastName ?? membership?.linkAsSentinel.lastName ?? null,
    userName: companion?.companion.userName ?? null,
    phone: companion?.companion.phone ?? membership?.linkAsSentinel.phone ?? null,
    email: companion?.companion.email ?? null,
  };
  const name = person.firstName;
  const publicStatus = publicStatusOf(circles, companions, userId);

  // A Sentinel SMS has no account: no in-app conversation with them.
  const canMessage =
    !!companion || (membership?.status === 'ACCEPTED' && membership.sentinelType !== 'ONLY_SMS');

  const isFirstCircle = circle?.circleType === 'FIRST';
  const sentinelRole = !membership
    ? null
    : membership.status !== 'ACCEPTED'
      ? 'pending'
      : membership.leadSlot
        ? 'lead'
        : isFirstCircle
          ? 'firstCircle'
          : 'other';
  const companionGroup = !companion ? null : companion.leadSlot ? 'lead' : companion.circle.isPrimary ? 'firstCircle' : 'others';

  const order: SectionKey[] =
    from === 'companion' ? ['alert', 'companion', 'sentinel'] : ['alert', 'sentinel', 'companion'];
  const sections = order.filter((k) => (k === 'alert' ? inAlert : k === 'sentinel' ? !!membership : !!companion));

  const toggle = (key: SectionKey) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="person-page">
      <button type="button" className="link-button" onClick={() => navigate(-1)}>
        {t('person.back')}
      </button>
      {error && <p className="form-error">{error}</p>}

      <div className="person-head">
        <PersonAvatar
          userId={userId}
          avatarPath={avatarPathOf(circles, companions, userId)}
          // No direct link (seen from an alert): a neutral grey silhouette.
          sentinelColor={
            membership ? (mySentinelColor(circles, userId) ?? 'var(--text-muted)') : linked ? null : '#9a9a9a'
          }
          companionColor={
            companion
              ? (myCompanionColor(companions, userId) ??
                companionGold(!!companion.leadSlot, companion.circle.isPrimary) ??
                companionColor(userId))
              : null
          }
          size={96}
        />
        <div className="person-head-text">
          <h1>
            {person.firstName} {person.lastName}
          </h1>
          {publicStatus && <p className="person-status">{publicStatus}</p>}
          {/* No direct link: first name only, no way to contact them. */}
          <div className="conversation-contact-details">
            {person.userName && <span>@{person.userName}</span>}
            {person.phone && <span>{person.phone}</span>}
            {person.email && <span>{person.email}</span>}
          </div>
          {canMessage && (
            <Link to={`/messages/${userId}`} className="button-link person-message">
              {t('companions.sendMessage', { name })}
            </Link>
          )}
        </div>
      </div>

      <div className="about-tiles">
        {sections.map((key) => {
          const isOpen = open.has(key);
          return (
            <section key={key} className={`about-tile${isOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="about-tile-head"
                aria-expanded={isOpen}
                aria-controls={`person-${key}`}
                onClick={() => toggle(key)}
              >
                <span className="about-tile-title">
                  {key === 'alert'
                    ? t('person.alert.title', { label: alert?.label })
                    : key === 'sentinel'
                      ? t('person.theyWatchYou', { name })
                      : t('person.youWatchThem', { name })}
                  <small>
                    {key === 'alert'
                      ? isAlertSubject
                        ? t('person.alert.isSubject', { name })
                        : t(participant?.isLead ? 'person.alert.inCircleLead' : 'person.alert.inCircle', {
                            name,
                            circle: participant?.circleName,
                            who: alert?.userCompanion.firstName,
                          })
                      : key === 'sentinel'
                        ? t(`person.sentinelRole.${sentinelRole}`, { circle: circle?.label })
                        : t(`companions.groups.${companionGroup}`)}
                  </small>
                </span>
                <svg className="about-tile-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {isOpen && (
                <div className="about-tile-body person-section" id={`person-${key}`}>
                  {key === 'alert' ? (
                    <ul className="person-alert-facts">
                      {participant && (
                        <li>{t(`alerts.detail.participantStatus.${participant.status}`)}</li>
                      )}
                      <li>{linked ? t('person.alert.linked') : t('person.alert.notLinked', { name })}</li>
                      <li>
                        {sharedAlertChat ? (
                          <>
                            {t('person.alert.canWriteInChat')}{' '}
                            <Link to={`/running-alert/${alertId}/chat`}>{t('person.alert.openChat')}</Link>
                          </>
                        ) : canMessage ? (
                          t('person.alert.canWriteDirect')
                        ) : (
                          t('person.alert.cannotWrite')
                        )}
                      </li>
                    </ul>
                  ) : key === 'sentinel' && membership && circle ? (
                    <>
                      <p className="person-role-hint">{t(`person.sentinelHint.${sentinelRole}`)}</p>
                      <SentinelActions
                        key={membership.id}
                        m={membership}
                        circles={circles}
                        isPrimary={isFirstCircle}
                        onChange={reload}
                        onError={setError}
                      />
                    </>
                  ) : companion ? (
                    <>
                      <p className="person-role-hint">{t(`companions.groupHints.${companionGroup}`)}</p>
                      <CompanionActions companion={companion} onChange={reload} onError={setError} />
                    </>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
