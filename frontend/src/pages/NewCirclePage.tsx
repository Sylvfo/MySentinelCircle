import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createCircle, createGroup, type Circle } from '../api/sentinel';
import { Tile } from '../components/Tile';

// One page per creation flow (reached from My Circles), each with a short
// explanation above the form. Both only take a name for now.
export function NewCirclePage() {
  return <CreatePage i18nKey="newCirclePage" create={createCircle} expandAfter />;
}

export function NewGroupPage() {
  return <CreatePage i18nKey="newGroupPage" create={createGroup} />;
}

function CreatePage({
  i18nKey,
  create,
  expandAfter,
}: {
  i18nKey: 'newCirclePage' | 'newGroupPage';
  create: (label: string) => Promise<Circle>;
  // Opens the new circle's detail, ready to invite its first Sentinels.
  expandAfter?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await create(label.trim());
      navigate(expandAfter ? `/circles/${created.id}` : '/circles');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link to="/circles">{t('common.back')}</Link>
      <h1>{t(`${i18nKey}.title`)}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t(`${i18nKey}.intro`)}</p>
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
    </div>
  );
}
