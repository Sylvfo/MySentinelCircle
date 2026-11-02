import { useTranslation } from 'react-i18next';
import { ALERT_QUESTION_KINDS, type AlertParticipant } from '../api/alert';
import { replyLabel } from './replyLabel';

interface Answer {
  name: string;
  response: string | null;
}

// "2 Oui, 1 Plus tard, 3 sans réponse": the Lead's view of one question.
function countLine(answers: Answer[], label: (response: string) => string, noAnswer: string): string {
  const counts = new Map<string, number>();
  for (const { response } of answers) {
    const key = response === null ? noAnswer : label(response);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => `${count} ${key}`).join(', ');
}

export function AlertRepliesSummary({
  participants,
  firstCircleId,
}: {
  participants: AlertParticipant[];
  firstCircleId: string;
}) {
  const { t } = useTranslation();
  const noAnswer = t('alerts.detail.repliesSummary.noAnswer');
  const label = (response: string) => replyLabel(t, response);
  const nameOf = (p: AlertParticipant) => p.userSentinels.linkAsSentinel.firstName;

  const firstCircle = participants
    .filter((p) => p.circleId === firstCircleId)
    .map((p) => ({ name: nameOf(p), response: p.response }));
  const answersTo = (kind: string) =>
    participants.flatMap((p) =>
      p.questions.filter((q) => q.kind === kind).map((q) => ({ name: nameOf(p), response: q.response })),
    );

  return (
    <>
      <h3>{t('alerts.detail.repliesSummary.title')}</h3>
      <ul>
        {firstCircle.length > 0 && (
          <li>
            {t('alerts.detail.repliesSummary.firstCircle')} : {countLine(firstCircle, label, noAnswer)}
          </li>
        )}
        {ALERT_QUESTION_KINDS.map((kind) => {
          const answers = answersTo(kind);
          if (answers.length === 0) return null;
          return (
            <li key={kind}>
              {t(`alerts.questions.${kind}`)}{' '}
              {kind === 'WHERE_SEEN'
                ? answers.map((a) => `${a.name} : ${a.response ?? noAnswer}`).join(' · ')
                : countLine(answers, label, noAnswer)}
            </li>
          );
        })}
      </ul>
    </>
  );
}
