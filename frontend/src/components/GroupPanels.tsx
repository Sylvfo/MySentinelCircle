import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acceptGroupInvitation,
  declineGroupInvitation,
  deleteGroup,
  inviteToGroup,
  leaveGroup,
  type Group,
  type GroupInvitation,
} from '../api/sentinel';
import { Tile } from './Tile';
import { ConfirmModal } from './Modal';
import { useAction } from '../useAction';

const LARGE_GROUP_THRESHOLD = 30;

export interface GroupContact {
  userId: string;
  label: string;
}

export function GroupInvitationsInbox({
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
export function GroupActions({
  group,
  onChange,
  onError,
}: {
  group: Group;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  // The founder deletes the whole group, anyone else leaves it.
  const action = group.isFounder ? 'delete' : 'leave';

  const { run } = useAction({ onError });
  const leaveOrDelete = () => {
    setAsking(false);
    void run(async () => {
      await (group.isFounder ? deleteGroup(group.rootId) : leaveGroup(group.rootId));
      onChange();
    });
  };

  return (
    <div className="tile-actions">
      <button className="ghost" onClick={() => setAsking(true)}>
        {t(`groups.${action}`)}
      </button>
      {asking && (
        <ConfirmModal
          message={t(action === 'delete' ? 'groups.confirmDelete' : 'groups.confirmLeave')}
          confirmLabel={t(`groups.${action}`)}
          onConfirm={leaveOrDelete}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  );
}

// The group circle page's "+": invite someone I'm already connected to.
export function GroupInviteForm({
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
  // Or anyone, by phone (an account isn't needed to be invited).
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [invited, setInvited] = useState<string | null>(null);

  const { run } = useAction({ onError });
  const send = (target: Parameters<typeof inviteToGroup>[1], label: string) => {
    setInvited(null);
    return run(async () => {
      await inviteToGroup(group.rootId, target);
      setInvited(label);
      onChange();
    });
  };

  const inviteContact = (e: FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;
    void send({ targetUserId }, eligible.find((c) => c.userId === targetUserId)?.label ?? '');
  };

  const invitePhone = async (e: FormEvent) => {
    e.preventDefault();
    if (await send({ phone: phone.trim(), name: name.trim() }, name.trim())) {
      setPhone('');
      setName('');
    }
  };

  return (
    <div className="inline-form">
      <h3>{t('groups.addMember')}</h3>
      {group.members.length >= LARGE_GROUP_THRESHOLD && (
        <p className="form-hint">{t('groups.largeGroupWarning', { count: group.members.length })}</p>
      )}
      {/* One of my contacts, in one click... */}
      {eligible.length > 0 && (
        <form className="row wrap" onSubmit={inviteContact}>
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
        </form>
      )}
      {/* ...or anyone, with their number. */}
      <p className="form-hint">{t(eligible.length > 0 ? 'groups.byPhoneOr' : 'groups.byPhone')}</p>
      <form className="row wrap" onSubmit={invitePhone}>
        <input
          type="tel"
          required
          placeholder={t('circles.invitePhone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input required placeholder={t('circles.inviteName')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!phone.trim() || !name.trim()}>
          {t('groups.invite')}
        </button>
      </form>
      {invited && <p className="form-hint">{t('groups.invitedSent', { who: invited })}</p>}
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('groups.phoneHint')}</p>
    </div>
  );
}
