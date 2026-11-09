import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../api/client';
import {
  getMyDeathNotice,
  setDeathNoticeRecipients,
  updateMyDeathNotice,
  type DeathNotice,
  type DeathNoticeRecipientOption,
} from '../api/user';
import { UpgradeNotice } from './Upgrade';
import { usePlan } from '../plan';
import { useAction } from '../useAction';

// Prepared while alive: the announcement broadcast to opted-in Sentinels
// once a death is confirmed (see SentinelService.confirmDeath), and who
// among them is notified, each with an optional personal message.
// The form's choice for each possible recipient, as last saved.
function recipientChoices(recipients: DeathNoticeRecipientOption[]) {
  return Object.fromEntries(
    recipients.map((r) => [r.linkId, { notify: r.notifyOnDeath, personalMessage: r.personalMessage ?? '' }]),
  );
}

export function DeathNoticePanel({ onError }: { onError: (m: string) => void }) {
  const { t } = useTranslation();
  const { plan } = usePlan();
  const [notice, setNotice] = useState<DeathNotice | null>(null);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Record<string, { notify: boolean; personalMessage: string }>>({});
  const messageSave = useAction({ onError });
  const recipientsSave = useAction({ onError });

  const reload = async () => {
    try {
      const data = await getMyDeathNotice();
      setNotice(data);
      setMessage(data.announcementMessage);
      setSelected(recipientChoices(data.recipients));
    } catch (err) {
      onError(errorText(err));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!notice) return null;

  const saveMessage = (e: FormEvent) => {
    e.preventDefault();
    void messageSave.run(() => updateMyDeathNotice(message.trim()));
  };

  const saveRecipients = (e: FormEvent) => {
    e.preventDefault();
    void recipientsSave.run(async () => {
      const recipients = Object.entries(selected)
        .filter(([, v]) => v.notify)
        .map(([linkId, v]) => ({ linkId, personalMessage: v.personalMessage.trim() || undefined }));
      const data = await setDeathNoticeRecipients(recipients);
      setSelected(recipientChoices(data.recipients));
    });
  };

  // Preparing it is paid: subscription or one-time purchase.
  if (plan && !plan.deathNotice) {
    return (
      <section className="panel">
        <h2>{t('settings.deathNotice.title')}</h2>
        <p className="muted">{t('settings.deathNotice.intro')}</p>
        <UpgradeNotice reason="deathNotice" />
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{t('settings.deathNotice.title')}</h2>
      <p className="muted">{t('settings.deathNotice.intro')}</p>

      <form onSubmit={saveMessage}>
        <label>
          {t('settings.deathNotice.announcementLabel')}
          <textarea
            rows={4}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <button type="submit" disabled={messageSave.busy}>
          {t('common.save')}
        </button>
      </form>

      <form onSubmit={saveRecipients}>
        <h3>{t('settings.deathNotice.recipientsTitle')}</h3>
        {notice.recipients.length === 0 ? (
          <p className="muted">{t('settings.deathNotice.noRecipients')}</p>
        ) : (
          notice.recipients.map((r) => (
            <div key={r.linkId} className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected[r.linkId]?.notify ?? false}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      [r.linkId]: { ...prev[r.linkId], notify: e.target.checked },
                    }))
                  }
                />
                {r.sentinelLabel}
              </label>
              <input
                type="text"
                placeholder={t('settings.deathNotice.personalMessagePlaceholder')}
                maxLength={500}
                value={selected[r.linkId]?.personalMessage ?? ''}
                disabled={!selected[r.linkId]?.notify}
                onChange={(e) =>
                  setSelected((prev) => ({
                    ...prev,
                    [r.linkId]: { ...prev[r.linkId], personalMessage: e.target.value },
                  }))
                }
              />
            </div>
          ))
        )}
        <button type="submit" disabled={recipientsSave.busy || notice.recipients.length === 0}>
          {t('common.save')}
        </button>
      </form>
    </section>
  );
}
