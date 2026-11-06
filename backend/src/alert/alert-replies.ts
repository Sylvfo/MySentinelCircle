import type { Gender } from '@prisma/client';
import { normalizeSmsText } from '../sms/normalize-sms';

export const ALERT_QUESTION_KINDS = [
  'CAN_VISIT',
  'LAST_NEWS',
  'SEEMED_OK',
  'WHERE_SEEN',
] as const;
export type AlertQuestionKind = (typeof ALERT_QUESTION_KINDS)[number];

export const MAX_ALERT_REPLY_LENGTH = 300;

export interface AlertReplyOption {
  code: string;
  smsLabel: string;
  words: string[];
}

// Choices of the 1st circle, who always answer from the app.
export const FIRST_CIRCLE_REPLIES: AlertReplyOption[] = [
  // "Can you take care of it now?" — GOING = yes, I'm on it (final).
  { code: 'GOING', smsLabel: "Oui, je m'en occupe", words: [] },
  { code: 'LATER', smsLabel: 'Plus tard', words: [] },
  { code: 'UNAVAILABLE', smsLabel: 'Je ne peux pas', words: [] },
];

interface AlertQuestionDefinition {
  // Default wording: speaks of the person as "la / elle" when their gender
  // isn't set (Sylvie's rule, 2026-11-06). `byGender` overrides it; "{name}"
  // is replaced by their first name (the neutral wording uses it).
  smsText: string;
  byGender?: Partial<Record<Gender, string>>;
  // Empty for a free-text question.
  replies: AlertReplyOption[];
}

const YES_WORDS = ['oui', 'ok', 'yes'];
const NO_WORDS = ['non', 'no'];

const ALERT_QUESTIONS: Record<AlertQuestionKind, AlertQuestionDefinition> = {
  CAN_VISIT: {
    smsText: 'Pouvez-vous aller la voir ?',
    byGender: {
      MALE: 'Pouvez-vous aller le voir ?',
      NEUTRAL: 'Pouvez-vous aller voir {name} ?',
    },
    replies: [
      { code: 'YES', smsLabel: 'Oui', words: YES_WORDS },
      { code: 'LATER', smsLabel: 'Plus tard', words: ['plus tard', 'tard'] },
      { code: 'NO', smsLabel: 'Non', words: NO_WORDS },
    ],
  },
  LAST_NEWS: {
    smsText: 'Ses dernieres nouvelles ?',
    replies: [
      {
        code: 'TODAY',
        smsLabel: "Aujourd'hui",
        words: ['aujourd hui', 'aujourdhui'],
      },
      {
        code: 'THIS_WEEK',
        smsLabel: 'Cette semaine',
        words: ['cette semaine'],
      },
      { code: 'LONGER', smsLabel: 'Avant', words: ['avant', 'plus longtemps'] },
    ],
  },
  SEEMED_OK: {
    smsText: 'Semblait-elle aller bien ?',
    byGender: {
      MALE: 'Semblait-il aller bien ?',
      NEUTRAL: '{name} semblait aller bien ?',
    },
    replies: [
      { code: 'YES', smsLabel: 'Oui', words: YES_WORDS },
      { code: 'NO', smsLabel: 'Non', words: NO_WORDS },
      {
        code: 'DONT_KNOW',
        smsLabel: 'Je ne sais pas',
        words: ['je ne sais pas', 'sais pas', 'sait pas'],
      },
    ],
  },
  WHERE_SEEN: {
    smsText: "Ou l'avez-vous vue pour la derniere fois ?",
    byGender: {
      MALE: "Ou l'avez-vous vu pour la derniere fois ?",
      NEUTRAL: 'Ou avez-vous vu {name} pour la derniere fois ?',
    },
    replies: [],
  },
};

export function alertQuestionText(
  kind: AlertQuestionKind,
  about?: { firstName: string; gender: Gender | null },
): string {
  const question = ALERT_QUESTIONS[kind];
  const text =
    (about?.gender && question.byGender?.[about.gender]) || question.smsText;
  return text.replace('{name}', about?.firstName ?? '');
}

export function repliesFor(kind: AlertQuestionKind): AlertReplyOption[] {
  return ALERT_QUESTIONS[kind].replies;
}

function freeText(body: string): string | null {
  return body.trim().slice(0, MAX_ALERT_REPLY_LENGTH) || null;
}

// The stored answer to an SMS, or null when it can't be understood.
export function parseAlertReply(
  body: string,
  kind: AlertQuestionKind,
): string | null {
  const replies = repliesFor(kind);
  if (replies.length === 0) return freeText(body);

  const normalized = normalizeSmsText(body);
  const digit = /^\d+\b/.exec(normalized)?.[0];
  if (digit) return replies[Number(digit) - 1]?.code ?? null;

  const match = replies.find((reply) =>
    reply.words.some(
      (word) => normalized === word || normalized.startsWith(`${word} `),
    ),
  );
  return match?.code ?? null;
}

// The same rule for an app reply, which sends a code rather than a digit.
export function parseAppReply(
  reply: string,
  kind: AlertQuestionKind | null,
): string | null {
  const options = kind ? repliesFor(kind) : FIRST_CIRCLE_REPLIES;
  if (options.length === 0) return freeText(reply);
  return options.some((option) => option.code === reply) ? reply : null;
}
