"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DECLINE_KEYWORDS = exports.ACCEPT_KEYWORDS = void 0;
exports.sentinelInvitationSms = sentinelInvitationSms;
exports.sentinelAcceptedSms = sentinelAcceptedSms;
exports.sentinelDeclinedSms = sentinelDeclinedSms;
exports.sentinelRequestSms = sentinelRequestSms;
exports.sentinelLeftSms = sentinelLeftSms;
exports.sentinelLeaveConfirmSms = sentinelLeaveConfirmSms;
exports.invitationAnsweredSms = invitationAnsweredSms;
exports.requestAnsweredSms = requestAnsweredSms;
exports.parseSmsReply = parseSmsReply;
const APP = 'MySentinelCircle';
function sentinelInvitationSms(inviter) {
    return (`${inviter} vous a choisi comme Sentinel sur ${APP}, ` +
        `un reseau d'entraide qui previent vos proches en cas d'urgence. ` +
        `Repondez OUI pour accepter, NON pour refuser.`);
}
function sentinelAcceptedSms(inviter) {
    return `C'est note : vous etes desormais Sentinel de ${inviter} sur ${APP}. Merci !`;
}
function sentinelDeclinedSms(inviter) {
    return `Vous avez refuse l'invitation de ${inviter} sur ${APP}. Aucune action de votre part n'est requise.`;
}
function sentinelRequestSms(requester) {
    return (`${requester} demande a devenir votre Sentinel sur ${APP}. ` +
        `Repondez OUI pour accepter, NON pour refuser.`);
}
function sentinelLeftSms(sentinelLabel) {
    return `${sentinelLabel} ne fait plus partie de vos Sentinels sur ${APP}.`;
}
function sentinelLeaveConfirmSms(ownerLabel) {
    return `C'est note : vous n'etes plus Sentinel de ${ownerLabel} sur ${APP}.`;
}
function invitationAnsweredSms(sentinelLabel, accepted) {
    return accepted
        ? `${sentinelLabel} a accepte votre invitation Sentinel sur ${APP}.`
        : `${sentinelLabel} a refuse votre invitation Sentinel sur ${APP}.`;
}
function requestAnsweredSms(targetLabel, accepted) {
    return accepted
        ? `${targetLabel} a accepte votre demande : vous etes desormais son Sentinel sur ${APP}.`
        : `${targetLabel} a refuse votre demande de Sentinel sur ${APP}.`;
}
exports.ACCEPT_KEYWORDS = ['oui', 'ok', 'accepte', 'yes', 'y', 'o'];
exports.DECLINE_KEYWORDS = ['non', 'no', 'refuse', 'stop', 'quitter', 'arreter', 'n'];
function parseSmsReply(body) {
    const normalized = body
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
    const firstWord = normalized.split(/\s+/)[0] ?? '';
    if (exports.ACCEPT_KEYWORDS.includes(firstWord))
        return 'accept';
    if (exports.DECLINE_KEYWORDS.includes(firstWord))
        return 'decline';
    return 'unknown';
}
//# sourceMappingURL=messages.js.map