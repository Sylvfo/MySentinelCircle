import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { requestToBeSentinel } from '../api/sentinel';
import { Tile } from '../components/Tile';
import { useAction } from '../useAction';

// Asking to become someone's Sentinel, reached from Companions' "New" button.
export function NewCompanionPage() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const { busy: submitting, error, run } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSent(false);
    void run(async () => {
      await requestToBeSentinel(phone.trim());
      setPhone('');
      setSent(true);
    });
  };

  return (
    <div>
      <Link to="/companions">{t('common.back')}</Link>
      <h1>{t('companions.requestTitle')}</h1>
      <p className="muted">{t('companions.requestIntro')}</p>
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
