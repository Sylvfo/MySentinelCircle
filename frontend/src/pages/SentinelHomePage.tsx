import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getMyParticipation, listAlerts, type MyParticipation } from '../api/alert';
import {
  acceptMembership,
  declineMembership,
  listMyDeathNotices,
  listMyInvitations,
  type Invitation,
  type MyDeathNotice,
} from '../api/sentinel';
import { AlertReplyPanel } from '../components/AlertReplyPanel';
import { SmsCodeLogin } from '../components/SmsCodeLogin';

// Where a Sentinel without an account lands after their SMS code: what they
// came for, with no profile or password to fill in first.
export function SentinelHomePage() {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated } = useAuth();
  const [participations, setParticipations] = useState<MyParticipation[]>([]);
  const [deathNotices, setDeathNotices] = useState<MyDeathNotice[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isSmsOnly = user?.userType === 'ONLY_SMS';

  const reload = useCallback(async () => {
    const [alerts, notices, pending] = await Promise.all([listAlerts(), listMyDeathNotices(), listMyInvitations()]);
    const open = alerts.filter((alert) => alert.alertStatus !== 'RESOLVED');
    setParticipations(await Promise.all(open.map((alert) => getMyParticipation(alert.id))));
    setDeathNotices(notices);
    setInvitations(pending);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (isSmsOnly) void reload();
  }, [isSmsOnly, reload]);

  if (loading) return <p className="page-loading">{t('common.loading')}</p>;
  if (!isAuthenticated) return <SmsCodeLogin />;
  if (!user) return <p className="page-loading">{t('common.loading')}</p>;
  if (!isSmsOnly) return <Navigate to="/running-alert" replace />;

  const isEmpty = loaded && participations.length + deathNotices.length + invitations.length === 0;

  return (
    <div className="auth-page">
      <h1>MySentinelCircle</h1>
      {!loaded && <p>{t('common.loading')}</p>}
      {isEmpty && <p>{t('sentinelHome.empty')}</p>}

      {participations.map((participation) => (
        <section key={participation.id}>
          <h2>{t('alerts.detail.about', { name: participation.alert.userCompanion.firstName })}</h2>
          <AlertReplyPanel
            alertId={participation.alert.id}
            name={participation.alert.userCompanion.firstName}
            gender={participation.alert.userCompanion.gender}
            questions={participation.questions}
            onChange={reload}
          />
        </section>
      ))}

      {invitations.map((invitation) => (
        <section key={invitation.id}>
          <p>{t('companions.invitedBy', { who: invitation.circle.userCompanion.firstName })}</p>
          <div className="row">
            <button onClick={() => acceptMembership(invitation.id).then(reload)}>{t('companions.accept')}</button>
            <button className="ghost" onClick={() => declineMembership(invitation.id).then(reload)}>
              {t('companions.decline')}
            </button>
          </div>
        </section>
      ))}

      {deathNotices.map((notice) => (
        <section key={notice.companionName}>
          <h2>{notice.companionName}</h2>
          <p>{notice.announcementMessage}</p>
          {notice.personalMessage && (
            <p>
              <strong>{t('companions.deathNotice.personalMessageLabel')}</strong> {notice.personalMessage}
            </p>
          )}
        </section>
      ))}

      <p>
        <Link to="/welcome">{t('sentinelHome.createAccount')}</Link>
      </p>
    </div>
  );
}
