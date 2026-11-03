import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { requestToBeSentinel } from '../api/sentinel';
import { Tile } from '../components/Tile';

// Asking to become someone's Sentinel, reached from Companions' "New" button.
export function NewCompanionPage() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      await requestToBeSentinel(phone.trim());
      setPhone('');
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link to="/companions">{t('common.back')}</Link>
      <h1>{t('companions.requestTitle')}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{t('companions.requestIntro')}</p>
      <Tile>
        <form onSubmit={submit}>
          <label>
            {t('companions.targetPhone')}
            <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button type="submit" disabled={submitting || !phone.trim()}>
            {t('companions.sendRequest')}
          </button>
          {sent && <p className="form-hint">{t('companions.requestSent')}</p>}
          {error && <p className="form-error">{error}</p>}
        </form>
      </Tile>
    </div>
  );
}
