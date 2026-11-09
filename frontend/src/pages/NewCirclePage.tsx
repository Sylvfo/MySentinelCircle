import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { createCircle, createGroup, type Circle } from '../api/sentinel';
import { Tile } from '../components/Tile';
import { UpgradeNotice } from '../components/Upgrade';
import { usePlan } from '../plan';
import { IncludedStar } from '../components/SubscribedStar';
import { useAction } from '../useAction';

// One page per creation flow (reached from My Circles), each with a short
// explanation above the form. Both only take a name for now.
export function NewCirclePage() {
  return <CreatePage i18nKey="newCirclePage" create={createCircle} expandAfter />;
}

export function NewGroupPage() {
  const { plan } = usePlan();
  // Founding a group is paid (joining one stays free).
  return (
    <CreatePage
      i18nKey="newGroupPage"
      create={createGroup}
      locked={plan !== null && !plan.groups}
      included={!!plan?.hasPaid}
    />
  );
}

function CreatePage({
  i18nKey,
  create,
  expandAfter,
  locked,
  included,
}: {
  i18nKey: 'newCirclePage' | 'newGroupPage';
  create: (label: string) => Promise<Circle>;
  // Opens the new circle's detail, ready to invite its first Sentinels.
  expandAfter?: boolean;
  // A paid feature on a free account: explain instead of the form.
  locked?: boolean;
  // A paid feature I subscribe to: the gold star by the title.
  included?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [label, setLabel] = useState('');
  const { busy: submitting, error, run } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const created = await create(label.trim());
      navigate(expandAfter ? `/circles/${created.id}` : '/circles');
    });
  };

  return (
    <div>
      <Link to="/circles">{t('common.back')}</Link>
      <h1>
        {t(`${i18nKey}.title`)}
        {included && <IncludedStar />}
      </h1>
      <p className="muted">{t(`${i18nKey}.intro`)}</p>
      {locked ? (
        <UpgradeNotice reason="groups" />
      ) : (
      <Tile>
        <form onSubmit={submit}>
          <label>
            {t(`${i18nKey}.nameLabel`)}
            <input
              value={label}
              required
              maxLength={60}
              placeholder={t(`${i18nKey}.namePlaceholder`)}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <p className="form-hint">{t(`${i18nKey}.next`)}</p>
          <button type="submit" disabled={submitting || !label.trim()}>
            {t(`${i18nKey}.create`)}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
      </Tile>
      )}
    </div>
  );
}
