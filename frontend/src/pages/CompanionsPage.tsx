import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
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
import { companionColor, companionGold } from '../theme';

export function CompanionsPage() {
  const { t } = useTranslation();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { linkId } = useParams();

  const reload = async () => {
    setError(null);
    try {
      const [c, i] = await Promise.all([listCompanions(), listMyInvitations()]);
      setCompanions(c);
      setInvitations(i);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

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
        <h1>{t('companions.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('companions.intro')}</p>
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
                <div className="companion-grid">
                  {g.items.map((c) => (
                    <Link key={c.linkId} to={`/people/${c.companion.id}?from=companion`} className="companion-card">
                      {/* Their own blue-violet shade; the outline turns gold when I.m in their 1st circle (darker for a Lead). */}
                      <PersonAvatar
                        userId={c.companion.id}
                        avatarPath={c.companion.avatarPath}
                        sentinelColor={null}
                        companionColor={companionGold(!!c.leadSlot, c.circle.isPrimary) ?? companionColor(c.companion.id)}
                        size={72}
                      />
                      <span className="companion-name">{c.companion.firstName}</span>
                      {needsAnswer(c) && (
                        <span className="companion-needs-answer">{t('companions.needsAnswer')}</span>
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
            {t('companions.invitationLine', { who: inv.circle.userCompanion.firstName })}
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
            <dd>{t(`companions.duties.${invitationRole(open)}`, { who: open.circle.userCompanion.firstName })}</dd>
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
