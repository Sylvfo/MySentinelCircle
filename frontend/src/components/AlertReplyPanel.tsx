import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  FIRST_CIRCLE_REPLY_CODES,
  QUESTION_REPLY_CODES,
  respondToAlert,
  type AlertQuestion,
} from '../api/alert';
import { Tile } from './Tile';

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
        <button key={code} className={code === current ? undefined : 'ghost'} onClick={() => onSelect(code)}>
          {t(`alerts.replies.${code}`)}
        </button>
      ))}
    </div>
  );
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

// The 1st circle answers the alert itself; an outer circle answers each
// question it received. Changing an answer is allowed while the alert is open.
export function AlertReplyPanel({
  alertId,
  firstCircleResponse,
  questions,
  onChange,
}: {
  alertId: string;
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
        <>
          <p>{t('alerts.detail.respond.prompt')}</p>
          <ReplyChoices codes={FIRST_CIRCLE_REPLY_CODES} current={firstCircleResponse} onSelect={(code) => reply(code)} />
        </>
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
        </div>
      ))}
      {error && <p className="form-error">{error}</p>}
    </Tile>
  );
}
