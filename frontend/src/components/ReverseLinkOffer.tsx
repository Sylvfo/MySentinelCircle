import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  inviteSentinel,
  listIncomingRequests,
  listMyInvitations,
  requestToBeSentinel,
  type Circle,
} from '../api/sentinel';
import { Modal } from './Modal';
import { useAction } from '../useAction';

// On a person page linked one way only: offers the other direction.
// - They watch over me → "Offer to watch over them" (they pick the circle).
// - I watch over them → "Invite them into my circles" (I pick the circle).
// If they already asked / invited me, points to where to answer instead.
export function ReverseLinkOffer({
  direction,
  userId,
  name,
  phone,
  circles,
  onChange,
}: {
  // 'watchThem': they're my Sentinel, I could watch over them.
  // 'inviteThem': they're my companion, they could watch over me.
  direction: 'watchThem' | 'inviteThem';
  userId: string;
  name: string;
  phone: string | null;
  circles: Circle[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  // A pending ask from them, the other way round: answered elsewhere.
  const [theyAsked, setTheyAsked] = useState(false);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  // Not the reserve (no direct placement) nor a group (own invite flow).
  const assignable = circles.filter((c) => c.circleType !== 'RESERVED' && c.circleType !== 'GROUP');
  const [circleId, setCircleId] = useState('');
  const [asLead, setAsLead] = useState(false);
  const chosenId = circleId || assignable[0]?.id || '';
  const chosenIsFirst = assignable.find((c) => c.id === chosenId)?.circleType === 'FIRST';

  useEffect(() => {
    const check =
      direction === 'watchThem'
        ? listMyInvitations().then((list) => list.some((i) => i.circle.userCompanion.id === userId))
        : listIncomingRequests().then((list) => list.some((r) => r.linkAsSentinel.id === userId));
    void check.then(setTheyAsked).catch(() => setTheyAsked(false));
  }, [direction, userId]);

  if (theyAsked) {
    return (
      <p className="reverse-link">
        {t(`person.reverse.${direction}.theyAsked`, { name })}{' '}
        <Link to={direction === 'watchThem' ? '/companions' : '/circles'}>{t('person.reverse.answer')}</Link>
      </p>
    );
  }
  if (sent) return <p className="reverse-link">✓ {t('person.reverse.watchThem.sent', { name })}</p>;
  // Every companion has a phone (no Sentinel without one); just in case.
  if (!phone) return null;

  const submit = () =>
    run(async () => {
      if (direction === 'watchThem') {
        await requestToBeSentinel(phone);
        setSent(true);
      } else {
        await inviteSentinel(chosenId, { phone, name, requestedAsLead: chosenIsFirst ? asLead : undefined });
        // Now a pending Sentinel of mine: the page shows it as such.
        onChange();
      }
      setOpen(false);
    });

  return (
    <div className="reverse-link">
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        {t(`person.reverse.${direction}.button`, { name })}
      </button>
      {open && (
        <Modal title={t(`person.reverse.${direction}.button`, { name })} onClose={() => setOpen(false)}>
          <p>{t(`person.reverse.${direction}.explain`, { name })}</p>
          {direction === 'inviteThem' && (
            <div className="row wrap">
              <label>
                {t('person.reverse.inviteThem.circle')}{' '}
                <select value={chosenId} onChange={(e) => setCircleId(e.target.value)}>
                  {assignable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {chosenIsFirst && (
                <label className="check">
                  <input type="checkbox" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} />
                  {t('sentinel.leadSentinel')}
                </label>
              )}
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="row">
            <button disabled={busy || (direction === 'inviteThem' && !chosenId)} onClick={() => void submit()}>
              {t(`person.reverse.${direction}.send`)}
            </button>
            <button className="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
