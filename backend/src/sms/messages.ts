// Wording for every SMS the app sends. Kept in French only for now (the app
// default language) since recipients may be non-app users with no locale — a
// bilingual/Accept-Language pass is noted in Afaireplustard.txt (i18n backend).
//
// Plain ASCII on purpose: an accent switches an SMS to a shorter length limit.
// `inviter` / `requester` are a human-readable label for a User. There's no
// display-name field on User yet, so callers pass the email or phone.

import { alertQuestionText, repliesFor } from '../alert/alert-replies';
import type { AlertQuestionKind } from '../alert/alert-replies';
import { normalizeSmsText } from './normalize-sms';

const APP = 'MySentinelCircle';
const SITE = 'mysentinelcircle.ch';
const LOGIN_LINK = `${SITE}/a`;

// Me -> Sentinel: sent to the invited person when "Me" adds them to a circle.
export function sentinelInvitationSms(inviter: string): string {
  return (
    `${inviter} vous a choisi.e comme Sentinel sur ${APP}, ` +
    `un reseau d'entraide qui previent vos proches en cas d'urgence. ` +
    `Aucun compte n'est necessaire. ` +
    `Repondez OUI pour accepter, NON pour refuser. ${SITE}`
  );
}

// Confirmation to the Sentinel once they accept. The one moment INFO is
// announced to someone who may never open the app.
export function sentinelAcceptedSms(inviter: string): string {
  return (
    `C'est note : vous etes desormais Sentinel de ${inviter} sur ${APP}. Merci !\n` +
    `Envoyez INFO pour en savoir plus, STOP pour arreter.\n${SITE}`
  );
}

// Confirmation to the Sentinel once they decline.
export function sentinelDeclinedSms(inviter: string): string {
  return `Vous avez refuse l'invitation de ${inviter} sur ${APP}. Aucune action de votre part n'est requise. ${SITE}`;
}

// Sent to "Me" when their only Lead Sentinel is gone: without a Lead, no alert
// can be raised.
export function lastLeadLeftSms(): string {
  return `Vous n'avez plus de Lead Sentinel sur ${APP}. Sans Lead, votre reseau ne peut pas fonctionner en cas d'alerte. Designez-en un : ${SITE}`;
}

// Reply to the last Lead sending STOP: the circle would be left without one.
export function lastLeadCannotLeaveSms(companionLabel: string): string {
  return (
    `${companionLabel} n'a pas d'autre Lead Sentinel : sans Lead, son reseau ne fonctionne pas. ` +
    `Nous lui demandons d'en designer un, puis renvoyez STOP. ${SITE}`
  );
}

// Sent to "Me" when their last Lead asks to leave.
export function lastLeadWantsToLeaveSms(sentinelLabel: string): string {
  return (
    `${sentinelLabel} souhaite arreter d'etre Lead Sentinel sur ${APP}. ` +
    `Sans Lead, votre reseau ne peut pas fonctionner. Designez-en un autre : ${SITE}`
  );
}

// Confirmation to the Sentinel who just opted out.
export function sentinelLeaveConfirmSms(ownerLabel: string): string {
  return `C'est note : vous n'etes plus Sentinel de ${ownerLabel} sur ${APP}. ${SITE}`;
}

function numberedNames(names: string[]): string {
  return names.map((name, index) => `${index + 1} ${name}`).join('\n');
}

function stopChoices(names: string[]): string {
  return names.map((_, index) => `STOP ${index + 1}`).join(' ou ');
}

// Reply to INFO.
export function sentinelInfoSms(names: string[], hasAccount: boolean): string {
  const noAccount = hasAccount ? '' : 'Pas de compte. ';
  const stop = names.length > 1 ? stopChoices(names) : 'STOP';
  return (
    `${APP} : vous etes Sentinel de :\n${numberedNames(names)}\n` +
    `${noAccount}Pour arreter : ${stop}. ${SITE}`
  );
}

// Reply to a bare STOP from someone following several people: nobody is
// removed until they say who.
export function stopChoiceSms(names: string[]): string {
  return (
    `Vous suivez plusieurs personnes :\n${numberedNames(names)}\n` +
    `Repondez ${stopChoices(names)}. ${SITE}`
  );
}

// Reply when several people are waiting for an answer and the SMS doesn't say
// which one. Homonyms can't be told apart here, hence the login link.
export function severalRequestsSms(examples: string[]): string {
  return (
    `Plusieurs demandes en cours. Repondez avec le prenom : ${examples.join(' ou ')}.\n` +
    `Ou connectez-vous : ${LOGIN_LINK}`
  );
}

// Reply to a message that matches nothing, outside any alert.
export function smsHelpSms(): string {
  return `Envoyez INFO pour voir vos proches, STOP pour arreter.`;
}

// Sent to every 1st-circle Sentinel when an alert is raised for their
// Companion. They answer from the app, never by SMS.
// mapUrl: where the person is, when they shared it on raising the alert.
export function alertRaisedSms(
  companionFullName: string,
  mapUrl?: string,
): string {
  return (
    `${APP} : alerte pour ${companionFullName}, dont vous etes Sentinel.\n` +
    (mapUrl ? `Sa position : ${mapUrl}\n` : '') +
    `Pouvez-vous vous en occuper maintenant ? Repondez dans l'app : ${LOGIN_LINK}`
  );
}

// Sent directly to "Me" when a Sentinel raises an alert on their behalf.
export function alertRaisedToCompanionSms(raiserLabel: string): string {
  return (
    `${raiserLabel} a declenche une alerte vous concernant sur ${APP}. ` +
    `Votre 1er cercle a ete prevenu. ${SITE}`
  );
}

// Sent once an alert closes to the outer-circle Sentinels actually contacted;
// the 1st circle gets the app notification.
export function alertClosedSms(companionLabel: string): string {
  return (
    `L'alerte concernant ${companionLabel} sur ${APP} est terminee. Merci pour votre aide.\n` +
    `Envoyez INFO pour en savoir plus.\n${SITE}`
  );
}

// Sent to "Me" when the 1st circle (not "Me" themself) closed the alert.
export function alertClosedToCompanionSms(): string {
  return `Votre 1er cercle a cloture l'alerte vous concernant sur ${APP}. ${SITE}`;
}

function alertReplyChoices(kind: AlertQuestionKind): string {
  const replies = repliesFor(kind);
  if (replies.length === 0) return 'Ou repondez ici en quelques mots';
  const choices = replies.map(
    (reply, index) => `${index + 1} ${reply.smsLabel}`,
  );
  return `Ou repondez : ${choices.join(', ')}`;
}

function alertReplyPrompt(kind: AlertQuestionKind): string {
  return `Connectez-vous : ${LOGIN_LINK}\n${alertReplyChoices(kind)}`;
}

// One question asked to an outer-circle Sentinel during an alert.
export function alertQuestionSms(
  companionFullName: string,
  kind: AlertQuestionKind,
): string {
  return (
    `${APP} : alerte ${companionFullName}\n${alertQuestionText(kind)}\n` +
    alertReplyPrompt(kind)
  );
}

// Acknowledgement sent back after an alert SMS reply is recorded.
export function alertReplyAckSms(
  companionLabel: string,
  kind: AlertQuestionKind,
): string {
  const ack = `Merci, c'est note pour ${companionLabel}.`;
  if (repliesFor(kind).length === 0) return ack;
  return (
    `${ack} Pour changer d'avis, connectez-vous : ${LOGIN_LINK}\n` +
    `Ou repondez 1, 2 ou 3.`
  );
}

// Sent back when an alert SMS reply can't be understood.
export function alertReplyHelpSms(kind: AlertQuestionKind): string {
  return alertReplyPrompt(kind);
}

// Sent to every opted-in recipient once a death is confirmed. Deliberately
// neither the name nor the announcement: the news must not arrive in a
// notification preview, it waits behind the login.
export function deathNoticeSms(): string {
  return (
    `${APP} : un deces nous a ete signale.\n` +
    `La personne vous avait mis sur sa liste.\n` +
    `Connectez-vous avec votre numero : ${LOGIN_LINK}`
  );
}

export function otpSms(code: string): string {
  return `Votre code de connexion ${APP} : ${code}. Valable 10 minutes. Ne le donnez a personne.`;
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
