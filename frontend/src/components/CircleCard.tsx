import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { deleteCircle, inviteSentinel, updateCircle, updateMembership, type Circle, type Group } from '../api/sentinel';
import { Tile } from './Tile';
import { Modal } from './Modal';
import { CircleRing } from './CircleRing';
import { useAuth } from '../auth/AuthContext';
import { PausePill } from './PauseNotice';
import { PRIMARY_AVATAR_COLOR, circlePalette } from '../theme';
import { useAction } from '../useAction';
import { GroupActions, GroupInviteForm, type GroupContact } from './GroupPanels';

// Soft guidance only — nothing stops a circle from growing past this, it
// just starts showing a "that's a lot" hint on the invite form. Group
// circles (e.g. a choir) get a higher threshold since they're expected to
// be bigger than a personal circle.
const LARGE_CIRCLE_THRESHOLD = 10;
// Hard cap enforced by the backend: a 1st circle handles an alert together.
const FIRST_CIRCLE_MAX = 6;
export function CircleCard({
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
  const { run } = useAction({ onError });

  // Deleting a circle never breaks a link: its Sentinels move to the
  // reserve circle (backend deleteCircle), confirmed in a real dialog first.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const del = () => {
    setConfirmingDelete(false);
    void run(async () => {
      await deleteCircle(circle.id);
      onChange();
      navigate('/circles');
    });
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
  const toggleAlertChat = () =>
    void run(async () => {
      await updateCircle(circle.id, { alertChatWithFirstCircle: !circle.alertChatWithFirstCircle });
      onChange();
    });

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
          <PausePill which="forMe" />
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
          liveMembers.length === 0 && <p className="muted">{t('circles.noMembers')}</p>
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
  const { busy: submitting, run } = useAction({ onError });

  if (candidates.length === 0) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await updateMembership(membershipId, { circleId: circle.id });
      onChange();
    });
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
  const { busy: submitting, run } = useAction({ onError });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await inviteSentinel(circleId, {
        phone: phone.trim(),
        name: name.trim(),
        requestedAsLead: isPrimary ? requestedAsLead : undefined,
      });
      setPhone('');
      setName('');
      setRequestedAsLead(false);
      onChange();
    });
  };

  return (
    <form className="inline-form invite-form" onSubmit={submit}>
      <h3>{t('circles.invite')}</h3>
      {isPrimary && <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>{t('circles.invitePrimaryHint')}</p>}
      <div className="row wrap">
        <input type="tel" required placeholder={t('circles.invitePhone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input required placeholder={t('circles.inviteName')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
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
