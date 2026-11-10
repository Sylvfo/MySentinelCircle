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
  smsLabelEn: string;
  // Words recognized in an SMS reply, in French and English.
  words: string[];
}

export type SmsLang = 'fr' | 'en';

export function replyLabel(option: AlertReplyOption, lang: SmsLang): string {
  return lang === 'en' ? option.smsLabelEn : option.smsLabel;
}

// Choices of the 1st circle, who always answer from the app.
export const FIRST_CIRCLE_REPLIES: AlertReplyOption[] = [
  // "Can you take care of it now?" — GOING = yes, I'm on it (final).
  {
    code: 'GOING',
    smsLabel: "Oui, je m'en occupe",
    smsLabelEn: "Yes, I'm on it",
    words: [],
  },
  { code: 'LATER', smsLabel: 'Plus tard', smsLabelEn: 'Later', words: [] },
  {
    code: 'UNAVAILABLE',
    smsLabel: 'Je ne peux pas',
    smsLabelEn: "I can't",
    words: [],
  },
];

interface AlertQuestionDefinition {
  // Default wording: speaks of the person as "la / elle" when their gender
  // isn't set (Sylvie's rule, 2026-11-06). `byGender` overrides it; "{name}"
  // is replaced by their first name (the neutral wording uses it).
  smsText: string;
  byGender?: Partial<Record<Gender, string>>;
  // Same in English (default "her", like the French "la").
  smsTextEn: string;
  byGenderEn?: Partial<Record<Gender, string>>;
  // Empty for a free-text question.
  replies: AlertReplyOption[];
}

const YES_WORDS = ['oui', 'ok', 'yes'];
const NO_WORDS = ['non', 'no'];
const LATER_WORDS = ['plus tard', 'tard', 'later'];

const ALERT_QUESTIONS: Record<AlertQuestionKind, AlertQuestionDefinition> = {
  CAN_VISIT: {
    smsText: 'Pouvez-vous aller la voir ?',
    byGender: {
      MALE: 'Pouvez-vous aller le voir ?',
      NEUTRAL: 'Pouvez-vous aller voir {name} ?',
    },
    smsTextEn: 'Can you go and see her?',
    byGenderEn: {
      MALE: 'Can you go and see him?',
      NEUTRAL: 'Can you go and see {name}?',
    },
    replies: [
      { code: 'YES', smsLabel: 'Oui', smsLabelEn: 'Yes', words: YES_WORDS },
      {
        code: 'LATER',
        smsLabel: 'Plus tard',
        smsLabelEn: 'Later',
        words: LATER_WORDS,
      },
      { code: 'NO', smsLabel: 'Non', smsLabelEn: 'No', words: NO_WORDS },
    ],
  },
  LAST_NEWS: {
    smsText: 'Ses dernieres nouvelles ?',
    smsTextEn: 'When did you last hear from them?',
    replies: [
      {
        code: 'TODAY',
        smsLabel: "Aujourd'hui",
        smsLabelEn: 'Today',
        words: ['aujourd hui', 'aujourdhui', 'today'],
      },
      {
        code: 'THIS_WEEK',
        smsLabel: 'Cette semaine',
        smsLabelEn: 'This week',
        words: ['cette semaine', 'this week'],
      },
      {
        code: 'LONGER',
        smsLabel: 'Avant',
        smsLabelEn: 'Before',
        words: ['avant', 'plus longtemps', 'before', 'longer'],
      },
    ],
  },
  SEEMED_OK: {
    smsText: 'Semblait-elle aller bien ?',
    byGender: {
      MALE: 'Semblait-il aller bien ?',
      NEUTRAL: '{name} semblait aller bien ?',
    },
    smsTextEn: 'Did she seem to be doing well?',
    byGenderEn: {
      MALE: 'Did he seem to be doing well?',
      NEUTRAL: 'Did {name} seem to be doing well?',
    },
    replies: [
      { code: 'YES', smsLabel: 'Oui', smsLabelEn: 'Yes', words: YES_WORDS },
      { code: 'NO', smsLabel: 'Non', smsLabelEn: 'No', words: NO_WORDS },
      {
        code: 'DONT_KNOW',
        smsLabel: 'Je ne sais pas',
        smsLabelEn: "I don't know",
        words: [
          'je ne sais pas',
          'sais pas',
          'sait pas',
          'i don t know',
          'dont know',
          'don t know',
        ],
      },
    ],
  },
  WHERE_SEEN: {
    smsText: "Ou l'avez-vous vue pour la derniere fois ?",
    byGender: {
      MALE: "Ou l'avez-vous vu pour la derniere fois ?",
      NEUTRAL: 'Ou avez-vous vu {name} pour la derniere fois ?',
    },
    smsTextEn: 'Where did you last see her?',
    byGenderEn: {
      MALE: 'Where did you last see him?',
      NEUTRAL: 'Where did you last see {name}?',
    },
    replies: [],
  },
};

export function alertQuestionText(
  kind: AlertQuestionKind,
  about?: { firstName: string; gender: Gender | null },
  lang: SmsLang = 'fr',
): string {
  const question = ALERT_QUESTIONS[kind];
  const [byGender, fallback] =
    lang === 'en'
      ? [question.byGenderEn, question.smsTextEn]
      : [question.byGender, question.smsText];
  const text = (about?.gender && byGender?.[about.gender]) || fallback;
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
