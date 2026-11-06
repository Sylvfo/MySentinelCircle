// The privacy policy, terms of use and legal notice, in each language.
// DRAFT (2026-11-06) — to be reviewed by Sylvie and, ideally, a lawyer
// before real users. Every statement must match what the backend actually
// does (retention: backend/src/privacy/retention.service.ts, deletion:
// backend/src/user/account-deletion.service.ts). Change the content
// materially → bump CURRENT_TERMS_VERSION (backend/src/privacy/terms.ts)
// and LEGAL_VERSION below, so everyone is asked to accept again.
//
// [À COMPLÉTER] marks what Sylvie still has to fill in.

export const LEGAL_VERSION = '2026-11';
export const CONTACT_EMAIL = 'mysentinelscircles@gmail.com';

export type LegalDoc = 'privacy' | 'terms' | 'legal';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalText {
  title: string;
  updated: string;
  sections: LegalSection[];
}

const fr: Record<LegalDoc, LegalText> = {
  privacy: {
    title: 'Politique de confidentialité',
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'Qui est responsable',
        paragraphs: [
          `MySentinelCircle est édité par [À COMPLÉTER : nom ou structure], [À COMPLÉTER : adresse], Suisse. Contact pour toute question sur vos données : ${CONTACT_EMAIL}.`,
          "Cette politique s'applique selon la loi fédérale suisse sur la protection des données (nLPD) et, pour les personnes dans l'Union européenne, selon le Règlement général sur la protection des données (RGPD).",
        ],
      },
      {
        title: 'Les données que nous traitons',
        items: [
          'Votre compte : prénom, nom (facultatif), nom d’utilisateur, email, numéro de téléphone, photo de profil (facultative), la façon de parler de vous dans les textes (elle, il ou neutre, facultative), statut public que vous écrivez vous-même.',
          'Vos cercles : les personnes que vous choisissez comme Sentinelles, leur rôle et l’ordre d’appel.',
          'Les alertes : le type d’alerte, son texte, les réponses des Sentinelles, et votre position GPS uniquement si vous appuyez vous-même sur « Ajouter ma position ».',
          'Les messages et photos échangés dans l’app.',
          'L’annonce de décès que vous préparez, et les messages personnels que vous y joignez.',
          'Les personnes invitées par téléphone : leur numéro et le prénom donné par la personne qui les invite.',
          'Les données techniques nécessaires au fonctionnement : journaux du serveur (adresse IP, date), codes de connexion stockés sous forme hachée.',
        ],
      },
      {
        title: 'Pourquoi nous les traitons',
        items: [
          'Faire fonctionner le service que vous demandez : prévenir vos proches, faire suivre une alerte d’un cercle à l’autre, permettre les messages (exécution du contrat).',
          'Contacter une personne invitée par téléphone pour lui demander si elle accepte d’être Sentinelle (intérêt légitime de la personne qui l’invite ; elle peut refuser à tout moment).',
          'Partager votre position pendant une alerte, uniquement quand vous le décidez (consentement, retirable à chaque alerte).',
          'Sécuriser le service : limiter les abus, bloquer les connexions suspectes (intérêt légitime).',
        ],
        paragraphs: ['Nous ne vendons aucune donnée, nous n’affichons aucune publicité ciblée et nous n’utilisons aucun outil de mesure d’audience.'],
      },
      {
        title: 'Qui peut voir vos données',
        items: [
          'Votre 1er cercle voit le détail de vos alertes ; un autre cercle ne voit que la question qu’on lui pose.',
          'Votre photo de profil n’est visible que par les personnes liées à vous.',
          'Les SMS passent par un fournisseur d’envoi de SMS ([À COMPLÉTER : fournisseur, pays]), qui reçoit le numéro et le texte du message.',
          'Le serveur est hébergé en Suisse ([À COMPLÉTER : hébergeur]).',
          'Si vous choisissez « Se connecter avec Google », Google vous identifie ; nous ne recevons que votre email et un identifiant.',
          'Les liens de position ouvrent Google Maps ou un autre service de carte que vous choisissez : ce service voit alors la position.',
          'Si vous dictez un message au lieu de l’écrire, la reconnaissance vocale de votre navigateur transforme votre voix en texte. Sur Chrome et Android, le son est envoyé à Google pour cela. L’app ne garde que le texte, jamais l’enregistrement.',
        ],
      },
      {
        title: 'Combien de temps nous les gardons',
        items: [
          'Les positions GPS sont effacées 30 jours après la fin de l’alerte.',
          'Les notifications sont effacées après 6 mois.',
          'Le numéro d’une personne invitée qui n’a jamais accepté ni créé de compte est effacé après 6 mois, ou tout de suite si elle répond NON ou STOP.',
          'Votre compte est gardé tant que vous l’utilisez. Si vous le supprimez, voir ci-dessous.',
        ],
      },
      {
        title: 'Supprimer votre compte',
        paragraphs: [
          'Vous pouvez supprimer votre compte à tout moment dans les Paramètres. Votre nom, numéro, email, photo, cercles, positions GPS, photos envoyées et messages de décès sont effacés tout de suite.',
          'Le texte de vos messages et l’historique des alertes restent lisibles par les autres personnes concernées, signés « Compte supprimé », pour qu’elles gardent la trace de ce qui s’est passé.',
        ],
      },
      {
        title: 'Vos droits',
        items: [
          'Savoir quelles données nous avons sur vous et en recevoir une copie.',
          'Les faire corriger.',
          'Les faire effacer.',
          'Vous opposer à un traitement ou retirer votre consentement.',
          'Les recevoir dans un format réutilisable (portabilité).',
        ],
        paragraphs: [
          `Écrivez à ${CONTACT_EMAIL} : nous répondons dans les 30 jours. Vous pouvez aussi vous adresser au Préposé fédéral à la protection des données et à la transparence (PFPDT, www.edoeb.admin.ch) ou, dans l’Union européenne, à l’autorité de protection des données de votre pays.`,
        ],
      },
      {
        title: 'Sécurité',
        paragraphs: [
          'Les connexions sont chiffrées (HTTPS). Les mots de passe et les codes ne sont jamais stockés tels quels, seulement sous forme hachée. Les actions sensibles demandent de confirmer à nouveau votre identité. En cas de fuite de données présentant un risque pour vous, nous prévenons l’autorité compétente et les personnes concernées.',
        ],
      },
      {
        title: 'Âge minimum',
        paragraphs: ['[À COMPLÉTER : âge minimum pour créer un compte, par exemple 16 ans, ou plus jeune avec l’accord d’un parent.]'],
      },
      {
        title: 'Changements',
        paragraphs: ['Si cette politique change de façon importante, l’app vous demande de l’accepter à nouveau.'],
      },
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'Le service',
        paragraphs: [
          'MySentinelCircle vous permet de choisir des proches de confiance (Sentinelles), de les ranger en cercles, et de les prévenir en cas de besoin. Une alerte passe d’un cercle à l’autre si le plus proche ne peut pas aider.',
        ],
      },
      {
        title: "Ce n'est pas un service d'urgence",
        paragraphs: [
          'MySentinelCircle ne remplace pas les services d’urgence. En cas de danger, appelez le 112 (urgences), le 117 (police), le 118 (pompiers) ou le 144 (ambulance).',
          'Nous faisons notre possible pour que les alertes arrivent, mais nous ne pouvons pas garantir qu’un SMS ou une notification soit reçu, ni qu’une Sentinelle réponde : réseau, téléphone éteint, panne ou fournisseur extérieur peuvent l’empêcher.',
        ],
      },
      {
        title: 'Votre compte',
        items: [
          'Vous donnez des informations exactes et gardez votre mot de passe pour vous.',
          'Vous n’ajoutez comme Sentinelle que des personnes qui vous connaissent, et vous respectez leur choix si elles refusent.',
          'Vous n’utilisez pas le service pour surveiller, harceler ou suivre quelqu’un contre son gré, ni pour lancer de fausses alertes.',
        ],
      },
      {
        title: 'Pause et annonce de décès',
        paragraphs: [
          'Vous pouvez mettre en pause les alertes à votre sujet ou votre participation aux alertes des autres, depuis les Paramètres.',
          'Une annonce de décès n’est envoyée qu’après confirmation par deux personnes de votre 1er cercle. Elle ne doit être signalée que si le décès est certain.',
        ],
      },
      {
        title: 'Offre payante',
        paragraphs: ['[À COMPLÉTER : prix, durée, renouvellement et résiliation de l’abonnement, une fois l’offre payante en place.]'],
      },
      {
        title: 'Fin du compte',
        paragraphs: [
          'Vous pouvez supprimer votre compte à tout moment. Nous pouvons suspendre un compte qui ne respecte pas ces conditions, après vous avoir prévenu.e sauf en cas d’abus grave.',
        ],
      },
      {
        title: 'Responsabilité',
        paragraphs: [
          'Dans les limites permises par la loi, nous ne sommes pas responsables des dommages causés par une alerte non reçue, une réponse tardive ou une indisponibilité du service.',
        ],
      },
      {
        title: 'Droit applicable',
        paragraphs: ['Ces conditions sont soumises au droit suisse. For : [À COMPLÉTER : ville], sous réserve des règles impératives protégeant les consommateur.rice.s.'],
      },
    ],
  },
  legal: {
    title: 'Mentions légales',
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'Éditeur',
        items: [
          'MySentinelCircle',
          '[À COMPLÉTER : nom ou structure]',
          '[À COMPLÉTER : adresse], Suisse',
          `Contact : ${CONTACT_EMAIL}`,
        ],
      },
      {
        title: 'Hébergement',
        items: ['[À COMPLÉTER : hébergeur, adresse], Suisse'],
      },
    ],
  },
};

const en: Record<LegalDoc, LegalText> = {
  privacy: {
    title: 'Privacy policy',
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'Who is responsible',
        paragraphs: [
          `MySentinelCircle is published by [TO COMPLETE: name or organisation], [TO COMPLETE: address], Switzerland. Contact for any question about your data: ${CONTACT_EMAIL}.`,
          'This policy follows the Swiss Federal Act on Data Protection (FADP) and, for people in the European Union, the General Data Protection Regulation (GDPR).',
        ],
      },
      {
        title: 'The data we process',
        items: [
          'Your account: first name, last name (optional), username, email, phone number, profile photo (optional), how texts speak about you (she, he or they, optional), the public status you write yourself.',
          'Your circles: the people you choose as Sentinels, their role and the calling order.',
          'Alerts: the alert type, its text, the Sentinels’ answers, and your GPS position only if you tap “Add my position” yourself.',
          'Messages and photos exchanged in the app.',
          'The death notice you prepare, and the personal messages you attach to it.',
          'People invited by phone: their number and the first name given by the person inviting them.',
          'Technical data needed to run the service: server logs (IP address, date), login codes stored hashed.',
        ],
      },
      {
        title: 'Why we process it',
        items: [
          'To run the service you ask for: warn your close ones, pass an alert from one circle to the next, allow messages (performance of the contract).',
          'To contact a person invited by phone and ask whether they agree to be a Sentinel (legitimate interest of the person inviting them; they can refuse at any time).',
          'To share your position during an alert, only when you decide to (consent, which you give again at each alert).',
          'To keep the service secure: limit abuse, block suspicious logins (legitimate interest).',
        ],
        paragraphs: ['We sell no data, show no targeted advertising and use no audience measurement tool.'],
      },
      {
        title: 'Who can see your data',
        items: [
          'Your 1st circle sees the details of your alerts; another circle only sees the question it is asked.',
          'Your profile photo is only visible to people linked to you.',
          'SMS go through an SMS provider ([TO COMPLETE: provider, country]), which receives the number and the message text.',
          'The server is hosted in Switzerland ([TO COMPLETE: host]).',
          'If you choose “Sign in with Google”, Google identifies you; we only receive your email and an identifier.',
          'Position links open Google Maps or another map service you choose: that service then sees the position.',
          'If you dictate a message instead of typing it, your browser’s speech recognition turns your voice into text. On Chrome and Android, the sound is sent to Google for that. The app only keeps the text, never the recording.',
        ],
      },
      {
        title: 'How long we keep it',
        items: [
          'GPS positions are erased 30 days after the alert ends.',
          'Notifications are erased after 6 months.',
          'The number of an invited person who never accepted nor created an account is erased after 6 months, or right away if they reply NO or STOP.',
          'Your account is kept as long as you use it. If you delete it, see below.',
        ],
      },
      {
        title: 'Deleting your account',
        paragraphs: [
          'You can delete your account at any time in Settings. Your name, number, email, photo, circles, GPS positions, sent photos and death messages are erased right away.',
          'The text of your messages and the alert history stay readable by the other people involved, signed “Deleted account”, so they keep a record of what happened.',
        ],
      },
      {
        title: 'Your rights',
        items: [
          'Know what data we hold about you and get a copy.',
          'Have it corrected.',
          'Have it erased.',
          'Object to a processing or withdraw your consent.',
          'Receive it in a reusable format (portability).',
        ],
        paragraphs: [
          `Write to ${CONTACT_EMAIL}: we answer within 30 days. You can also contact the Swiss Federal Data Protection and Information Commissioner (FDPIC, www.edoeb.admin.ch) or, in the European Union, your country’s data protection authority.`,
        ],
      },
      {
        title: 'Security',
        paragraphs: [
          'Connections are encrypted (HTTPS). Passwords and codes are never stored as such, only hashed. Sensitive actions ask you to confirm your identity again. If a data breach puts you at risk, we notify the competent authority and the people concerned.',
        ],
      },
      {
        title: 'Minimum age',
        paragraphs: ['[TO COMPLETE: minimum age to create an account, e.g. 16, or younger with a parent’s consent.]'],
      },
      {
        title: 'Changes',
        paragraphs: ['If this policy changes materially, the app asks you to accept it again.'],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'The service',
        paragraphs: [
          'MySentinelCircle lets you choose trusted people (Sentinels), arrange them in circles, and warn them when needed. An alert moves on to the next circle if the closest one can’t help.',
        ],
      },
      {
        title: 'Not an emergency service',
        paragraphs: [
          'MySentinelCircle does not replace emergency services. If you are in danger, call 112 (emergencies), 117 (police), 118 (fire) or 144 (ambulance).',
          'We do our best for alerts to get through, but we can’t guarantee that an SMS or notification is received, nor that a Sentinel answers: network, a switched-off phone, an outage or an outside provider can prevent it.',
        ],
      },
      {
        title: 'Your account',
        items: [
          'You give accurate information and keep your password to yourself.',
          'You only add as Sentinels people who know you, and you respect their choice if they refuse.',
          'You don’t use the service to watch, harass or track anyone against their will, nor to raise false alerts.',
        ],
      },
      {
        title: 'Pause and death notice',
        paragraphs: [
          'You can pause alerts about you, or your part in other people’s alerts, from Settings.',
          'A death notice is only sent after two people of your 1st circle confirm it. It must only be reported when the death is certain.',
        ],
      },
      {
        title: 'Paid plan',
        paragraphs: ['[TO COMPLETE: price, duration, renewal and cancellation of the subscription, once the paid plan exists.]'],
      },
      {
        title: 'Ending the account',
        paragraphs: [
          'You can delete your account at any time. We may suspend an account that breaks these terms, after warning you except in case of serious abuse.',
        ],
      },
      {
        title: 'Liability',
        paragraphs: [
          'To the extent permitted by law, we are not liable for damage caused by an alert not received, a late answer or the service being unavailable.',
        ],
      },
      {
        title: 'Governing law',
        paragraphs: ['These terms are governed by Swiss law. Place of jurisdiction: [TO COMPLETE: city], subject to mandatory consumer protection rules.'],
      },
    ],
  },
  legal: {
    title: 'Legal notice',
    updated: `Version ${LEGAL_VERSION}`,
    sections: [
      {
        title: 'Publisher',
        items: [
          'MySentinelCircle',
          '[TO COMPLETE: name or organisation]',
          '[TO COMPLETE: address], Switzerland',
          `Contact: ${CONTACT_EMAIL}`,
        ],
      },
      {
        title: 'Hosting',
        items: ['[TO COMPLETE: host, address], Switzerland'],
      },
    ],
  },
};

export function legalText(doc: LegalDoc, language: string): LegalText {
  return (language.startsWith('fr') ? fr : en)[doc];
}
