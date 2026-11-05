import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  FIRST_CIRCLE_REPLY_CODES,
  QUESTION_REPLY_CODES,
  respondToAlert,
  type AlertQuestion,
  type AlertType,
} from '../api/alert';
import { firstCircleAskKey } from '../alertAsk';
import { Tile } from './Tile';
import { replyLabel } from './replyLabel';

function ReplyChoices({
  codes,
  current,
  onSelect,
}: {
  codes: readonly string[];
  current: string | null;
  onSelect: (code: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="row wrap">
      {codes.map((code) => (
        <button
          key={code}
          className={code === current ? 'reply-choice selected' : 'reply-choice ghost'}
          aria-pressed={code === current}
          onClick={() => onSelect(code)}
        >
          {t(`alerts.replies.${code}`)}
        </button>
      ))}
    </div>
  );
}

// The answer on record, spelled out — clicking a choice must visibly do
// something, not just recolor a button.
function SavedReply({ current }: { current: string | null }) {
  const { t } = useTranslation();
  if (!current) return null;
  return <p className="reply-saved">✓ {t('alerts.detail.respond.saved', { reply: replyLabel(t, current) })}</p>;
}

function FreeReply({ current, onSubmit }: { current: string | null; onSubmit: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(current ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };

  return (
    <form className="row wrap" onSubmit={submit}>
      <input
        required
        maxLength={300}
        placeholder={t('alerts.detail.respond.freePlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">{t('alerts.detail.respond.send')}</button>
    </form>
  );
}

// The 1st circle's own answer: pick, then confirm — nothing is sent on
// the first tap. "I'm going" is final once sent (the others count on it);
// "Later" / "Unavailable" can still be changed.
function FirstCircleReply({
  name,
  alertType,
  current,
  onSend,
}: {
  name: string;
  alertType?: AlertType;
  current: string | null;
  onSend: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<string | null>(null);

  if (current === 'GOING') {
    return <p className="reply-saved reply-final">✓ {t('alerts.detail.respond.sent', { reply: replyLabel(t, current) })}</p>;
  }
  return (
    <>
      <h3 className="reply-question">{t(`alerts.ask.${firstCircleAskKey(alertType)}`, { name })}</h3>
      <p className="form-hint">{t('alerts.ask.whatItMeans', { name })}</p>
      {current && <p className="reply-saved">✓ {t('alerts.detail.respond.sent', { reply: replyLabel(t, current) })}</p>}
      <ReplyChoices codes={FIRST_CIRCLE_REPLY_CODES} current={choice ?? current} onSelect={setChoice} />
      {choice && choice !== current && (
        <>
          <button className="reply-confirm" onClick={() => onSend(choice)}>
            {t('alerts.detail.respond.confirm', { reply: replyLabel(t, choice) })}
          </button>
          {choice === 'GOING' && <p className="form-hint">{t('alerts.detail.respond.goingIsFinal')}</p>}
        </>
      )}
    </>
  );
}

// The 1st circle answers the alert itself; an outer circle answers each
// question it received (those answers can change while the alert is open).
export function AlertReplyPanel({
  alertId,
  name = '',
  alertType,
  firstCircleResponse,
  questions,
  onChange,
}: {
  alertId: string;
  // Who the alert is about, and what kind of alert, for the 1st circle's question.
  name?: string;
  alertType?: AlertType;
  // undefined when the viewer isn't in the 1st circle.
  firstCircleResponse?: string | null;
  questions: AlertQuestion[];
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const reply = (text: string, questionId?: string) => {
    setError(null);
    respondToAlert(alertId, text, questionId)
      .then(onChange)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  };

  return (
    <Tile>
      {firstCircleResponse !== undefined && (
        <FirstCircleReply name={name} alertType={alertType} current={firstCircleResponse} onSend={(code) => reply(code)} />
      )}
      {questions.map((question) => (
        <div key={question.id}>
          <p>{t(`alerts.questions.${question.kind}`)}</p>
          {question.kind === 'WHERE_SEEN' ? (
            <FreeReply current={question.response} onSubmit={(text) => reply(text, question.id)} />
          ) : (
            <ReplyChoices
              codes={QUESTION_REPLY_CODES[question.kind]}
              current={question.response}
              onSelect={(code) => reply(code, question.id)}
            />
          )}
          <SavedReply current={question.response} />
        </div>
      ))}
      {error && <p className="form-error">{error}</p>}
    </Tile>
  );
}
