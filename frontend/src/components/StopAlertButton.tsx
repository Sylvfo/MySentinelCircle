import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { closeAlert, type MyAlertSummary } from '../api/alert';
import { Modal } from './Modal';
import { genderContext } from '../gender';
import { useAction } from '../useAction';

// "Stop the alert", behind a confirmation — only the companion and their
// 1st circle can stop one (enforced by the backend too), so it renders
// nothing for anyone else.
// Ready-made closing words when stopping an alert (editable after).
const CLOSING_WORDS = ['fine', 'found', 'falseAlarm', 'sad'] as const;

export function StopAlertButton({ alert, onStopped }: { alert: MyAlertSummary; onStopped: () => Promise<void> }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [finalWord, setFinalWord] = useState('');
  const { error, run } = useAction();

  // The person the alert is about, as the closing words name them.
  const name = alert.userCompanionId === user?.id ? (user?.firstName ?? '') : alert.userCompanion.firstName;
  const closingWord = (k: (typeof CLOSING_WORDS)[number]) =>
    t(`alerts.closingWords.${k}.text`, {
      name,
      context: genderContext(alert.userCompanion.gender),
    });

  const canStop =
    alert.alertStatus !== 'RESOLVED' &&
    (alert.userCompanionId === user?.id || alert.myParticipation?.circleId === alert.firstCircleId);
  if (!canStop) return null;

  const stop = () => {
    setConfirming(false);
    return run(async () => {
      // The closing word becomes the stopper's status note, is posted in
      // the alert's chats and goes out in the end-of-alert SMS (backend).
      await closeAlert(alert.id, finalWord.trim() || undefined);
      await onStopped();
    });
  };

  return (
    <div className="alert-stop">
      <button className="ghost danger" onClick={() => setConfirming(true)}>
        {t('alerts.stop')}
      </button>
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <Modal title={t('alerts.stopTitle')} onClose={() => setConfirming(false)}>
          <p>{t('alerts.stopConfirm')}</p>
          {/* A few ready words to pick from, then edit if wanted. */}
          <div className="stop-words">
            {CLOSING_WORDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`stop-word${finalWord === closingWord(k) ? ' selected' : ''}`}
                onClick={() => setFinalWord(closingWord(k))}
              >
                {t(`alerts.closingWords.${k}.label`)}
              </button>
            ))}
          </div>
          <label className="stop-final-word">
            {t('alerts.stopFinalWordLabel')}
            <textarea
              rows={2}
              placeholder={t('alerts.stopFinalWordPlaceholder')} maxLength={300}
              value={finalWord}
              onChange={(e) => setFinalWord(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="danger" onClick={stop}>
              {t('alerts.stopConfirmButton')}
            </button>
            <button className="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
