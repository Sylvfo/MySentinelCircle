import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  acceptMembership,
  declineMembership,
  listCompanions,
  listMyInvitations,
  type Companion,
  type Invitation,
} from '../api/sentinel';
import { Modal } from '../components/Modal';
import { PersonAvatar } from '../components/PersonAvatar';
import { PauseNotice, PausePill } from '../components/PauseNotice';
import { GiftYearButton } from '../components/Upgrade';
import { NameStar } from '../components/SubscribedStar';
import { usePlan } from '../plan';
import { useAuth } from '../auth/AuthContext';
import { companionColor, companionGold } from '../theme';
import { genderContext } from '../gender';
import { Loading } from '../components/Loading';
import { useLoad } from '../useLoad';

export function CompanionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { plan } = usePlan();
  const { linkId } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const [companions, invitations] = await Promise.all([listCompanions(), listMyInvitations()]);
    return { companions, invitations };
  });
  const companions = data?.companions ?? [];
  const invitations = data?.invitations ?? [];

  if (loading) return <Loading />;

  // Anything waiting on me goes first: a pending circle-move proposal or a
  // death report to confirm. Invitations received sit above the list anyway.
  const needsAnswer = (c: Companion) => !!c.proposedCircle || !!c.deathNotice.pending?.canConfirmOrReject;
  const sorted = [...companions].sort((a, b) => Number(needsAnswer(b)) - Number(needsAnswer(a)));
  // Grouped by my role towards them, closest first. Empty groups are skipped.
  const groups = [
    { key: 'lead', items: sorted.filter((c) => c.leadSlot) },
    { key: 'firstCircle', items: sorted.filter((c) => !c.leadSlot && c.circle.isPrimary) },
    { key: 'others', items: sorted.filter((c) => !c.leadSlot && !c.circle.isPrimary) },
  ];

  // /companions/:linkId: one companion's details and actions, like a
  // circle's own page on My Circles.
  // Old /companions/:linkId links: a companion's details now live on their
  // person page (PersonPage).
  if (linkId) {
    const c = companions.find((x) => x.linkId === linkId);
    return <Navigate to={c ? `/people/${c.companion.id}?from=companion` : '/companions'} replace />;
  }

  return (
    <div className="page-bleed sticky-header-page companion-page">
      <div className="sticky-header">
        <h1>
          {t('companions.title')} <PausePill which="forOthers" />
        </h1>
        <p className="muted">{t('companions.intro')}</p>
        <PauseNotice which="forOthers" />
        {error && <p className="form-error">{error}</p>}
        <div className="header-actions">
          <Link to="/companions/new" className="button-link">
            {t('companions.new')}
          </Link>
        </div>
      </div>

      <InvitationsInbox invitations={invitations} onChange={reload} />

      {companions.length === 0 ? (
        <div className="empty-state">{t('companions.empty')}</div>
      ) : (
        groups.map(
          (g) =>
            g.items.length > 0 && (
              <section key={g.key} className="companion-group">
                {/* Thin labelled separator: my role towards everyone below it. */}
                <h2 className="companion-group-sep">{t(`companions.groups.${g.key}`)}</h2>
                {/* What this role means if something happens. */}
                <p className="companion-group-hint">{t(`companions.groupHints.${g.key}`)}</p>
                {/* Greyed while I'm on pause for others — still usable. */}
                <div className={`companion-grid${user?.pausedForOthers ? ' area-paused' : ''}`}>
                  {g.items.map((c) => (
                    <Link key={c.linkId} to={`/people/${c.companion.id}?from=companion`} className="companion-card">
                      {/* Their own blue-violet shade; the outline turns gold when I.m in their 1st circle (darker for a Lead). */}
                      <PersonAvatar
                        userId={c.companion.id}
                        avatarPath={c.companion.avatarPath}
                        paused={c.companion.pausedForMe}
                        subscribed={c.companion.subscribed}
                        sentinelColor={null}
                        companionColor={companionGold(!!c.leadSlot, c.circle.isPrimary) ?? companionColor(c.companion.id)}
                        size={72}
                      />
                      <span className="companion-name">
                        {c.companion.firstName}
                        {c.companion.subscribed && <NameStar />}
                      </span>
                      {needsAnswer(c) && (
                        <span className="companion-needs-answer">{t('companions.needsAnswer')}</span>
                      )}
                      {c.companion.freeAlertUsed && (
                        <GiftYearButton
                          userId={c.companion.id}
                          name={c.companion.firstName}
                          gender={c.companion.gender}
                          plan={plan}
                          onDone={() => void reload()}
                        />
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ),
        )
      )}
    </div>
  );
}

// The role an invitation offers: a Lead request wins over the base type.
const invitationRole = (inv: Invitation) => (inv.requestedAsLead ? 'LEAD' : inv.sentinelType);

// One small line per invitation; clicking it opens the details (circle, role,
// what that role involves) with Accept / Decline.
function InvitationsInbox({ invitations, onChange }: { invitations: Invitation[]; onChange: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Invitation | null>(null);
  if (invitations.length === 0) return null;

  const answer = (action: () => Promise<unknown>) => {
    setOpen(null);
    void action().then(onChange);
  };

  return (
    <div className="invitation-lines">
      {invitations.map((inv) => (
        <button key={inv.id} type="button" className="invitation-line" onClick={() => setOpen(inv)}>
          <span className="invitation-dot" aria-hidden="true" />
          <span className="invitation-text">
            {t('companions.invitationLine', {
              who: inv.circle.userCompanion.firstName,
              context: genderContext(inv.circle.userCompanion.gender),
            })}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
      {open && (
        <Modal
          title={t('companions.invitationTitle', { who: open.circle.userCompanion.firstName })}
          onClose={() => setOpen(null)}
        >
          <dl className="invitation-details">
            <dt>{t('companions.invitationCircle')}</dt>
            <dd>{open.circle.label}</dd>
            <dt>{t('companions.invitationRole')}</dt>
            <dd>{t(`sentinel.type.${invitationRole(open)}`)}</dd>
            <dt>{t('companions.invitationDuties')}</dt>
            <dd>
              {t(`companions.duties.${invitationRole(open)}`, {
                who: open.circle.userCompanion.firstName,
                context: genderContext(open.circle.userCompanion.gender),
              })}
            </dd>
          </dl>
          <div className="row">
            <button onClick={() => answer(() => acceptMembership(open.id))}>{t('companions.accept')}</button>
            <button className="ghost" onClick={() => answer(() => declineMembership(open.id))}>
              {t('companions.decline')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
