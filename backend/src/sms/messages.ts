import type { Gender } from '@prisma/client';
// Wording for every SMS the app sends, in the recipient's language (French or
// English, User.language): an account holder's own choice in the app, or, for
// someone without an account, the language of whoever invited them.
//
// Plain ASCII on purpose: an accent switches an SMS to a shorter length limit.
// `inviter` / `requester` are a human-readable label for a User (their first
// name, else their number).

import {
  alertQuestionText,
  repliesFor,
  replyLabel,
} from '../alert/alert-replies';
import type { AlertQuestionKind, SmsLang } from '../alert/alert-replies';
import { normalizeSmsText } from './normalize-sms';

export type { SmsLang } from '../alert/alert-replies';

const APP = 'MySentinelCircle';
const SITE = 'mysentinelcircle.ch';
const LOGIN_LINK = `${SITE}/a`;

// A stored language (User.language) as an SMS language: French unless English.
export function smsLang(language: string | null | undefined): SmsLang {
  return language === 'en' ? 'en' : 'fr';
}

// Invited into a group: with an account, they answer in the app; without
// one, they first create it with this same number (the invitation waits).
export function groupInvitationSms(
  inviter: string,
  group: string,
  hasAccount: boolean,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${inviter} invites you to the group ${group} on ${APP}, ` +
      `a mutual-aid network where everyone watches over the others. ` +
      (hasAccount
        ? `Sign in to accept or decline: ${SITE}`
        : `Create your account with this number to join the group: ${SITE}`)
    );
  }
  return (
    `${inviter} vous invite dans le groupe ${group} sur ${APP}, ` +
    `un reseau d'entraide ou chacun.e veille sur les autres. ` +
    (hasAccount
      ? `Connectez-vous pour accepter ou refuser : ${SITE}`
      : `Creez votre compte avec ce numero pour rejoindre le groupe : ${SITE}`)
  );
}

// Me -> Sentinel: sent to the invited person when "Me" adds them to a circle.
export function sentinelInvitationSms(
  inviter: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${inviter} chose you as a Sentinel on ${APP}, ` +
      `a mutual-aid network that alerts your loved ones in an emergency. ` +
      `No account needed. ` +
      `Reply YES to accept, NO to decline, ` +
      `STOP to never be contacted again (your number will be erased). ${SITE}`
    );
  }
  return (
    `${inviter} vous a choisi.e comme Sentinel sur ${APP}, ` +
    `un reseau d'entraide qui previent vos proches en cas d'urgence. ` +
    `Aucun compte n'est necessaire. ` +
    `Repondez OUI pour accepter, NON pour refuser, ` +
    `STOP pour ne plus etre contacte.e (votre numero sera efface). ${SITE}`
  );
}

// Confirmation to the Sentinel once they accept. The one moment INFO is
// announced to someone who may never open the app.
export function sentinelAcceptedSms(
  inviter: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `Done: you are now a Sentinel of ${inviter} on ${APP}. Thank you!\n` +
      `Send INFO to learn more, STOP to quit.\n${SITE}`
    );
  }
  return (
    `C'est note : vous etes desormais Sentinel de ${inviter} sur ${APP}. Merci !\n` +
    `Envoyez INFO pour en savoir plus, STOP pour arreter.\n${SITE}`
  );
}

// Confirmation to the Sentinel once they decline.
export function sentinelDeclinedSms(
  inviter: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return `You declined the invitation from ${inviter} on ${APP}. Nothing more is needed from you. ${SITE}`;
  }
  return `Vous avez refuse l'invitation de ${inviter} sur ${APP}. Aucune action de votre part n'est requise. ${SITE}`;
}

// Sent to "Me" when their only Lead Sentinel is gone: without a Lead, no alert
// can be raised.
export function lastLeadLeftSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `You no longer have a Lead Sentinel on ${APP}. Without a Lead, your network can't work in an alert. Choose one: ${SITE}`;
  }
  return `Vous n'avez plus de Lead Sentinel sur ${APP}. Sans Lead, votre reseau ne peut pas fonctionner en cas d'alerte. Designez-en un : ${SITE}`;
}

// Reply to the last Lead sending STOP: the circle would be left without one.
export function lastLeadCannotLeaveSms(
  companionLabel: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${companionLabel} has no other Lead Sentinel: without a Lead, their network doesn't work. ` +
      `We are asking them to choose one, then send STOP again. ${SITE}`
    );
  }
  return (
    `${companionLabel} n'a pas d'autre Lead Sentinel : sans Lead, son reseau ne fonctionne pas. ` +
    `Nous lui demandons d'en designer un, puis renvoyez STOP. ${SITE}`
  );
}

// Sent to "Me" when their last Lead asks to leave.
export function lastLeadWantsToLeaveSms(
  sentinelLabel: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${sentinelLabel} wants to stop being a Lead Sentinel on ${APP}. ` +
      `Without a Lead, your network can't work. Choose another one: ${SITE}`
    );
  }
  return (
    `${sentinelLabel} souhaite arreter d'etre Lead Sentinel sur ${APP}. ` +
    `Sans Lead, votre reseau ne peut pas fonctionner. Designez-en un autre : ${SITE}`
  );
}

// Confirmation to the Sentinel who just opted out.
export function sentinelLeaveConfirmSms(
  ownerLabel: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return `Done: you are no longer a Sentinel of ${ownerLabel} on ${APP}. ${SITE}`;
  }
  return `C'est note : vous n'etes plus Sentinel de ${ownerLabel} sur ${APP}. ${SITE}`;
}

function numberedNames(names: string[]): string {
  return names.map((name, index) => `${index + 1} ${name}`).join('\n');
}

function stopChoices(names: string[], lang: SmsLang): string {
  return names
    .map((_, index) => `STOP ${index + 1}`)
    .join(lang === 'en' ? ' or ' : ' ou ');
}

// Reply to INFO.
export function sentinelInfoSms(
  names: string[],
  hasAccount: boolean,
  lang: SmsLang = 'fr',
): string {
  const stop = names.length > 1 ? stopChoices(names, lang) : 'STOP';
  if (lang === 'en') {
    const noAccount = hasAccount ? '' : 'No account. ';
    return (
      `${APP}: you are a Sentinel of:\n${numberedNames(names)}\n` +
      `${noAccount}To quit: ${stop}. ${SITE}`
    );
  }
  const noAccount = hasAccount ? '' : 'Pas de compte. ';
  return (
    `${APP} : vous etes Sentinel de :\n${numberedNames(names)}\n` +
    `${noAccount}Pour arreter : ${stop}. ${SITE}`
  );
}

// Reply to a bare STOP from someone following several people: nobody is
// removed until they say who.
export function stopChoiceSms(names: string[], lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return (
      `You watch over several people:\n${numberedNames(names)}\n` +
      `Reply ${stopChoices(names, lang)}. ${SITE}`
    );
  }
  return (
    `Vous suivez plusieurs personnes :\n${numberedNames(names)}\n` +
    `Repondez ${stopChoices(names, lang)}. ${SITE}`
  );
}

// Reply when several people are waiting for an answer and the SMS doesn't say
// which one. Homonyms can't be told apart here, hence the login link.
export function severalRequestsSms(
  examples: string[],
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `Several requests are waiting. Reply with the first name: ${examples.join(' or ')}.\n` +
      `Or sign in: ${LOGIN_LINK}`
    );
  }
  return (
    `Plusieurs demandes en cours. Repondez avec le prenom : ${examples.join(' ou ')}.\n` +
    `Ou connectez-vous : ${LOGIN_LINK}`
  );
}

// Reply to a message that matches nothing, outside any alert.
export function smsHelpSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `Send INFO to see your loved ones, STOP to quit.`;
  }
  return `Envoyez INFO pour voir vos proches, STOP pour arreter.`;
}

// Sent to every 1st-circle Sentinel when an alert is raised for their
// Companion. They answer from the app, never by SMS.
// mapUrl: where the person is, when they shared it on raising the alert —
// or, for an assistance alert raised by someone on the spot, where that
// someone is (sharedBy = their first name).
export function alertRaisedSms(
  companionFullName: string,
  mapUrl?: string,
  sharedBy?: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    const position = sharedBy
      ? `Position of ${sharedBy} (who raised the alert): ${mapUrl}\n`
      : `Their position: ${mapUrl}\n`;
    return (
      `${APP}: alert for ${companionFullName}, whose Sentinel you are.\n` +
      (mapUrl ? position : '') +
      `Can you take care of it now? Answer in the app: ${LOGIN_LINK}`
    );
  }
  const position = sharedBy
    ? `Position de ${sharedBy} (qui a lance l'alerte) : ${mapUrl}\n`
    : `Sa position : ${mapUrl}\n`;
  return (
    `${APP} : alerte pour ${companionFullName}, dont vous etes Sentinel.\n` +
    (mapUrl ? position : '') +
    `Pouvez-vous vous en occuper maintenant ? Repondez dans l'app : ${LOGIN_LINK}`
  );
}

// Sent directly to "Me" when a Sentinel raises an alert on their behalf.
export function alertRaisedToCompanionSms(
  raiserLabel: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${raiserLabel} raised an alert about you on ${APP}. ` +
      `Your 1st circle has been told. ${SITE}`
    );
  }
  return (
    `${raiserLabel} a declenche une alerte vous concernant sur ${APP}. ` +
    `Votre 1er cercle a ete prevenu. ${SITE}`
  );
}

// Sent once an alert closes to the outer-circle Sentinels actually contacted;
// the 1st circle gets the app notification.
// finalWord: the closing words chosen by whoever stopped the alert.
export function alertClosedSms(
  companionLabel: string,
  finalWord?: string | null,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `The alert about ${companionLabel} on ${APP} is over` +
      (finalWord ? `: ${finalWord}\n` : '. ') +
      `Thank you for your help.\n` +
      `Send INFO to learn more.\n${SITE}`
    );
  }
  return (
    `L'alerte concernant ${companionLabel} sur ${APP} est terminee` +
    (finalWord ? ` : ${finalWord}\n` : '. ') +
    `Merci pour votre aide.\n` +
    `Envoyez INFO pour en savoir plus.\n${SITE}`
  );
}

// Sent to "Me" when the 1st circle (not "Me" themself) closed the alert.
export function alertClosedToCompanionSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `Your 1st circle closed the alert about you on ${APP}. ${SITE}`;
  }
  return `Votre 1er cercle a cloture l'alerte vous concernant sur ${APP}. ${SITE}`;
}

function alertReplyChoices(kind: AlertQuestionKind, lang: SmsLang): string {
  const replies = repliesFor(kind);
  if (replies.length === 0) {
    return lang === 'en'
      ? 'Or reply here in a few words'
      : 'Ou repondez ici en quelques mots';
  }
  const choices = replies.map(
    (reply, index) => `${index + 1} ${replyLabel(reply, lang)}`,
  );
  return lang === 'en'
    ? `Or reply: ${choices.join(', ')}`
    : `Ou repondez : ${choices.join(', ')}`;
}

function alertReplyPrompt(kind: AlertQuestionKind, lang: SmsLang): string {
  const signIn = lang === 'en' ? 'Sign in' : 'Connectez-vous';
  const colon = lang === 'en' ? ':' : ' :';
  return `${signIn}${colon} ${LOGIN_LINK}\n${alertReplyChoices(kind, lang)}`;
}

// One question asked to an outer-circle Sentinel during an alert.
export function alertQuestionSms(
  companionFullName: string,
  kind: AlertQuestionKind,
  // How to speak about them ("la voir" / "le voir"); unset = "la".
  about?: { firstName: string; gender: Gender | null },
  lang: SmsLang = 'fr',
): string {
  const head =
    lang === 'en'
      ? `${APP}: alert ${companionFullName}`
      : `${APP} : alerte ${companionFullName}`;
  return (
    `${head}\n${alertQuestionText(kind, about, lang)}\n` +
    alertReplyPrompt(kind, lang)
  );
}

// Acknowledgement sent back after an alert SMS reply is recorded.
export function alertReplyAckSms(
  companionLabel: string,
  kind: AlertQuestionKind,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    const ack = `Thank you, noted for ${companionLabel}.`;
    if (repliesFor(kind).length === 0) return ack;
    return (
      `${ack} To change your mind, sign in: ${LOGIN_LINK}\n` +
      `Or reply 1, 2 or 3.`
    );
  }
  const ack = `Merci, c'est note pour ${companionLabel}.`;
  if (repliesFor(kind).length === 0) return ack;
  return (
    `${ack} Pour changer d'avis, connectez-vous : ${LOGIN_LINK}\n` +
    `Ou repondez 1, 2 ou 3.`
  );
}

// Sent back when an alert SMS reply can't be understood.
export function alertReplyHelpSms(
  kind: AlertQuestionKind,
  lang: SmsLang = 'fr',
): string {
  return alertReplyPrompt(kind, lang);
}

// Sent to every opted-in recipient once a death is confirmed. Deliberately
// neither the name nor the announcement: the news must not arrive in a
// notification preview, it waits behind the login.
export function deathNoticeSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return (
      `${APP}: a death has been reported to us.\n` +
      `The person had put you on their list.\n` +
      `Sign in with your number: ${LOGIN_LINK}`
    );
  }
  return (
    `${APP} : un deces nous a ete signale.\n` +
    `La personne vous avait mis sur sa liste.\n` +
    `Connectez-vous avec votre numero : ${LOGIN_LINK}`
  );
}

// ---- Watch Mode (trip / All Good Check) ---------------------------------

// A deadline in the person's own zone (watch/zoned-time.ts deadlineParts):
// "13:00", or "11.11 a 13:00" when it isn't today.
export interface SmsDeadline {
  time: string;
  date: string | null;
}

function sayDeadline(d: SmsDeadline, lang: SmsLang): string {
  if (!d.date) return d.time;
  return lang === 'en' ? `${d.date} at ${d.time}` : `${d.date} a ${d.time}`;
}

// What the person typed (a place, a trip name, instructions), kept within
// plain ASCII like the rest of the text. Long instructions are cut: the
// full text is in the app.
function asciiText(text: string, max = 300): string {
  const plain = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 3).trimEnd()}...` : plain;
}

// To the traveller, at the time of a step.
export function watchStepReminderSms(
  place: string,
  due: SmsDeadline,
  alertAt: SmsDeadline,
  gender: Gender | null,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${APP}: have you reached the step "${asciiText(place)}" ` +
      `(planned at ${sayDeadline(due, lang)})? Reply OK if all is well, ` +
      `or confirm in the app: ${LOGIN_LINK}\n` +
      `Without an answer by ${sayDeadline(alertAt, lang)}, ` +
      `your 1st circle will be told.`
    );
  }
  const arrived =
    gender === 'FEMALE' ? 'arrivee' : gender === 'MALE' ? 'arrive' : 'arrive.e';
  return (
    `${APP} : etes-vous bien ${arrived} a l'etape "${asciiText(place)}" ` +
    `(prevue a ${sayDeadline(due, lang)}) ? Repondez OK si tout va bien, ` +
    `ou validez dans l'app : ${LOGIN_LINK}\n` +
    `Sans reponse a ${sayDeadline(alertAt, lang)}, ` +
    `votre 1er cercle sera prevenu.`
  );
}

// To the person, at the time of their All Good Check.
export function watchAllGoodReminderSms(
  alertAt: SmsDeadline,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${APP}: is all well? Reply OK, or confirm in the app: ${LOGIN_LINK}\n` +
      `Without an answer by ${sayDeadline(alertAt, lang)}, ` +
      `your 1st circle will be told.`
    );
  }
  return (
    `${APP} : tout va bien ? Repondez OK, ou validez dans l'app : ` +
    `${LOGIN_LINK}\n` +
    `Sans reponse a ${sayDeadline(alertAt, lang)}, ` +
    `votre 1er cercle sera prevenu.`
  );
}

// To the 1st circle, when a deadline passed without news: what was missed
// and the person's own instructions.
export function watchAlertSms(
  companionFullName: string,
  missed:
    | { kind: 'STEP'; place: string; due: SmsDeadline; tripName: string }
    | { kind: 'ALL_GOOD'; due: SmsDeadline },
  instructions: string,
  lang: SmsLang = 'fr',
): string {
  const name = asciiText(companionFullName, 100);
  const todo = instructions.trim() ? asciiText(instructions) : '';
  if (lang === 'en') {
    const what =
      missed.kind === 'STEP'
        ? `the step "${asciiText(missed.place)}" of the trip ` +
          `"${asciiText(missed.tripName, 100)}", planned at ` +
          `${sayDeadline(missed.due, lang)}, was not confirmed.`
        : `no "All good" since the check due at ` +
          `${sayDeadline(missed.due, lang)}.`;
    return (
      `${APP}: alert for ${name}, whose Sentinel you are: ${what}\n` +
      (todo ? `What to do: ${todo}\n` : '') +
      `Answer in the app: ${LOGIN_LINK}`
    );
  }
  const what =
    missed.kind === 'STEP'
      ? `l'etape "${asciiText(missed.place)}" du voyage ` +
        `"${asciiText(missed.tripName, 100)}", prevue a ` +
        `${sayDeadline(missed.due, lang)}, n'a pas ete validee.`
      : `pas de "Tout va bien" depuis le check prevu a ` +
        `${sayDeadline(missed.due, lang)}.`;
  return (
    `${APP} : alerte pour ${name}, dont vous etes Sentinel : ${what}\n` +
    (todo ? `Que faire : ${todo}\n` : '') +
    `Repondez dans l'app : ${LOGIN_LINK}`
  );
}

// To the person, once their 1st circle was told.
export function watchAlertToOwnerSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return (
      `${APP}: no news from you, your 1st circle has been told. ` +
      `If all is well, say so in the app: ${LOGIN_LINK}`
    );
  }
  return (
    `${APP} : sans nouvelles de vous, votre 1er cercle a ete prevenu. ` +
    `Si tout va bien, dites-le dans l'app : ${LOGIN_LINK}`
  );
}

export function otpSms(code: string, lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `Your ${APP} sign-in code: ${code}. Valid for 10 minutes. Never share it.`;
  }
  return `Votre code de connexion ${APP} : ${code}. Valable 10 minutes. Ne le donnez a personne.`;
}

// Lost phone (account recovery through the 1st circle) ---------------------

// To each Lead (and possible second confirmer) of the person's 1st circle.
export function phoneRecoveryRequestedSms(
  label: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return (
      `${APP}: ${label} says they lost their phone and asks to change their number. ` +
      `Check with them yourself before confirming in the app, otherwise refuse: ${LOGIN_LINK}`
    );
  }
  return (
    `${APP} : ${label} dit avoir perdu son telephone et demande a changer de numero. ` +
    `Verifiez avec elle avant de confirmer dans l'app, sinon refusez : ${LOGIN_LINK}`
  );
}

// To the old number: if the phone isn't lost, its owner learns someone asked.
export function phoneRecoveryOldNumberSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `${APP}: someone asked to move your account to a new number. If it wasn't you, sign in and tell your 1st circle: ${SITE}`;
  }
  return `${APP} : quelqu'un a demande a passer votre compte sur un nouveau numero. Si ce n'est pas vous, connectez-vous et prevenez votre 1er cercle : ${SITE}`;
}

// To the new number once the 1st circle confirmed: the code that finishes it.
export function phoneRecoveryCodeSms(
  code: string,
  lang: SmsLang = 'fr',
): string {
  if (lang === 'en') {
    return `${APP}: your 1st circle confirmed it's you. Code to confirm your new number: ${code}. Valid for 10 minutes.`;
  }
  return `${APP} : votre 1er cercle a confirme que c'est vous. Code pour valider votre nouveau numero : ${code}. Valable 10 minutes.`;
}

// To the new number when a confirmer refused.
export function phoneRecoveryRefusedSms(lang: SmsLang = 'fr'): string {
  if (lang === 'en') {
    return `${APP}: your request to change your number was not confirmed by your 1st circle. ${SITE}`;
  }
  return `${APP} : votre demande de changement de numero n'a pas ete confirmee par votre 1er cercle. ${SITE}`;
}

// Reply-keyword parsing for SMS accept/decline. Matching is done on
// normalizeSmsText's output, so keep these lowercase and unaccented.
export const ACCEPT_KEYWORDS = ['oui', 'ok', 'accepte', 'yes', 'y', 'o'];
export const DECLINE_KEYWORDS = ['non', 'no', 'refuse', 'n'];
// The only words that remove someone from their Sentinels. A plain NON never
// does, so an answer sent after an alert can't cost anyone their network.
export const LEAVE_KEYWORDS = ['stop', 'quitter', 'arreter'];

export type SmsReplyIntent = 'accept' | 'decline' | 'unknown';

export function parseSmsReply(body: string): SmsReplyIntent {
  const firstWord = normalizeSmsText(body).split(' ')[0] ?? '';
  if (ACCEPT_KEYWORDS.includes(firstWord)) return 'accept';
  if (DECLINE_KEYWORDS.includes(firstWord)) return 'decline';
  return 'unknown';
}

export type SmsCommand =
  { kind: 'info' } | { kind: 'stop'; position: number | null };

// INFO and STOP work at any time, including during an alert.
export function parseSmsCommand(body: string): SmsCommand | null {
  const [word, argument, ...rest] = normalizeSmsText(body).split(' ');
  if (word === 'info' && !argument) return { kind: 'info' };
  if (!LEAVE_KEYWORDS.includes(word ?? '') || rest.length > 0) return null;
  if (!argument) return { kind: 'stop', position: null };
  return /^\d+$/.test(argument)
    ? { kind: 'stop', position: Number(argument) }
    : null;
}
