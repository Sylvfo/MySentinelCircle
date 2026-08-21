// Wording for the SMS sent around Sentinel invitations. Kept in French only
// for now (the app default language) since recipients may be non-app users
// with no locale — a bilingual/Accept-Language pass is noted in
// Afaireplustard.txt (i18n backend).
//
// `inviter` / `requester` are a human-readable label for a User. There's no
// display-name field on User yet, so callers pass the email or phone.

const APP = 'MySentinelCircle';

// Me -> Sentinel: sent to the invited person when "Me" adds them to a circle.
export function sentinelInvitationSms(inviter: string): string {
  return (
    `${inviter} vous a choisi comme Sentinel sur ${APP}, ` +
    `un reseau d'entraide qui previent vos proches en cas d'urgence. ` +
    `Repondez OUI pour accepter, NON pour refuser.`
  );
}

// Confirmation to the Sentinel once they accept (from site or by SMS).
export function sentinelAcceptedSms(inviter: string): string {
  return `C'est note : vous etes desormais Sentinel de ${inviter} sur ${APP}. Merci !`;
}

// Confirmation to the Sentinel once they decline.
export function sentinelDeclinedSms(inviter: string): string {
  return `Vous avez refuse l'invitation de ${inviter} sur ${APP}. Aucune action de votre part n'est requise.`;
}

// Sentinel -> Me: sent to the target "Me" when someone asks to become their
// Sentinel. Can be approved/refused by SMS reply (or from the app).
export function sentinelRequestSms(requester: string): string {
  return (
    `${requester} demande a devenir votre Sentinel sur ${APP}. ` +
    `Repondez OUI pour accepter, NON pour refuser.`
  );
}

// Sent to "Me" when one of their Sentinels leaves (opts out by SMS).
export function sentinelLeftSms(sentinelLabel: string): string {
  return `${sentinelLabel} ne fait plus partie de vos Sentinels sur ${APP}.`;
}

// Confirmation to the Sentinel who just opted out.
export function sentinelLeaveConfirmSms(ownerLabel: string): string {
  return `C'est note : vous n'etes plus Sentinel de ${ownerLabel} sur ${APP}.`;
}

// Sent to the inviter "Me" once their invited Sentinel answers.
export function invitationAnsweredSms(
  sentinelLabel: string,
  accepted: boolean,
): string {
  return accepted
    ? `${sentinelLabel} a accepte votre invitation Sentinel sur ${APP}.`
    : `${sentinelLabel} a refuse votre invitation Sentinel sur ${APP}.`;
}

// Sent to the requester once the target "Me" answers their Sentinel request.
export function requestAnsweredSms(
  targetLabel: string,
  accepted: boolean,
): string {
  return accepted
    ? `${targetLabel} a accepte votre demande : vous etes desormais son Sentinel sur ${APP}.`
    : `${targetLabel} a refuse votre demande de Sentinel sur ${APP}.`;
}

// Reply-keyword parsing for SMS accept/decline. Case- and accent-insensitive
// matching is done by the caller; keep these lowercase and unaccented.
export const ACCEPT_KEYWORDS = ['oui', 'ok', 'accepte', 'yes', 'y', 'o'];
// STOP / QUITTER double as "leave" for an already-accepted Sentinel — see
// SentinelService.handleInboundSms.
export const DECLINE_KEYWORDS = [
  'non',
  'no',
  'refuse',
  'stop',
  'quitter',
  'arreter',
  'n',
];

export type SmsReplyIntent = 'accept' | 'decline' | 'unknown';

export function parseSmsReply(body: string): SmsReplyIntent {
  const normalized = body
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // strip accents
  const firstWord = normalized.split(/\s+/)[0] ?? '';
  if (ACCEPT_KEYWORDS.includes(firstWord)) return 'accept';
  if (DECLINE_KEYWORDS.includes(firstWord)) return 'decline';
  return 'unknown';
}
