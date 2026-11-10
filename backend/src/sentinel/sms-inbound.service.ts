import { Inject, Injectable } from '@nestjs/common';
import { AlertType, UserType } from '@prisma/client';
import { OuterCirclesService } from '../alert/outer-circles.service';
import type { OpenAlertQuestion } from '../alert/outer-circles.service';
import type { AlertQuestionKind } from '../alert/alert-replies';
import {
  parseSmsCommand,
  parseSmsReply,
  sentinelInfoSms,
  severalRequestsSms,
  smsHelpSms,
  stopChoiceSms,
  watchCheckAckSms,
  alertReplyChoicesText,
} from '../sms/messages';
import type { SmsLang } from '../sms/messages';
import { SMS_CATEGORY, parseReplyCode, replyCode } from '../sms/sms-reply-code';
import type { SmsCommand } from '../sms/messages';
import { findReplyTarget } from '../sms/sms-reply-target';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { RetentionService } from '../privacy/retention.service';
import { SentinelService } from './sentinel.service';
import { WatchService } from '../watch/watch.service';
import { deadlineParts } from '../watch/zoned-time';
import type { LinkWithParties } from './sentinel.service';
import { smsLang } from '../sms/messages';

const HELP_SMS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NO_MATCH = { matched: false as const, reason: 'no_actionable_link' };

type SmsResult = { matched: true; action: string };

// Something this number can answer: an alert question, a Watch Mode
// deadline of their own, or an invitation.
// `code`: its SMS reply code (sms-reply-code.ts), "21" -> 211 / 212…;
// `choices`: how to answer it, for the "several requests" SMS.
interface SmsRequest {
  name: string;
  answered: boolean;
  code: string;
  choices: (lang: SmsLang) => string;
  answer: (reply: string) => Promise<SmsResult | null>;
}

// The single place that decides what a received SMS means, since Sentinels
// don't need an account. Checks run in priority order; the business logic
// stays in SentinelService and AlertService.
@Injectable()
export class SmsInboundService {
  // In memory on purpose: a restart costs at most one extra SMS per number.
  private readonly lastHelpSentAt = new Map<string, number>();

  constructor(
    private readonly sentinel: SentinelService,
    private readonly outerCircles: OuterCirclesService,
    private readonly watches: WatchService,
    private readonly retention: RetentionService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async handle(from: string, body: string) {
    const phone = from.trim();

    const command = parseSmsCommand(body);
    if (command) return this.handleCommand(phone, command);

    const requests = await this.listRequests(phone);
    // A reply code says exactly what it answers ("212", "21 au marche").
    const coded = parseReplyCode(body);
    const codeTarget =
      coded && requests.find((request) => request.code === coded.code);
    if (coded && codeTarget) {
      const answered = await codeTarget.answer(coded.reply);
      return answered ?? this.sendHelpOncePerDay(phone);
    }

    // Older SMS asked for the first name in front ("Lea 1"): still read.
    const target = findReplyTarget(
      body,
      requests.map((request) => request.name),
    );
    if (target) {
      const named = await requests[target.index].answer(target.reply);
      return named ?? this.sendHelpOncePerDay(phone);
    }

    // Nothing left to answer: a reply can still change the latest answer.
    const unanswered = requests.filter((request) => !request.answered);
    const candidates =
      unanswered.length > 0 ? unanswered : requests.slice(0, 1);

    if (candidates.length > 1) {
      const lang = smsLang(await this.sentinel.languageByPhone(phone));
      await this.sms.send(
        phone,
        severalRequestsSms(
          candidates.map(({ name, choices }) => `${name} : ${choices(lang)}`),
          lang,
        ),
      );
      return { matched: true as const, action: 'several_requests' };
    }

    const result = await candidates[0]?.answer(body);
    return result ?? this.sendHelpOncePerDay(phone);
  }

  // Alerts first, being more urgent, newest first; then the person's own
  // watch deadlines; invitations last.
  private async listRequests(phone: string): Promise<SmsRequest[]> {
    const [questions, watchChecks, invitations] = await Promise.all([
      this.outerCircles.listOpenQuestionsByPhone(phone),
      this.watches.smsChecksByPhone(phone),
      this.sentinel.listInvitationsByPhone(phone),
    ]);
    return [
      ...questions.map((question) => this.questionRequest(phone, question)),
      ...watchChecks.map((watch) => this.watchRequest(phone, watch)),
      ...invitations.map((link) => this.invitationRequest(link)),
    ];
  }

  // "OK" to a Watch Mode reminder: the deadline is validated as planned.
  private watchRequest(
    phone: string,
    watch: Awaited<ReturnType<WatchService['smsChecksByPhone']>>[number],
  ): SmsRequest {
    // 311 a trip, 321 the All Good Check (one of each at most).
    const code = replyCode(
      SMS_CATEGORY.WATCH,
      watch.alertType === AlertType.TRAVEL ? 1 : 2,
    );
    return {
      name: watch.label,
      answered: false,
      code,
      choices: (lang) =>
        `${code}1 ${lang === 'en' ? 'All good' : 'Tout va bien'}`,
      answer: async (reply) => {
        if (reply.trim() !== '1' && parseSmsReply(reply) !== 'accept') {
          return null;
        }
        const done = await this.watches.confirmBySms(watch);
        const now = new Date();
        const due = done.next
          ? deadlineParts(done.next.expectedAt, done.timeZone, now)
          : null;
        await this.sms.send(
          phone,
          watchCheckAckSms(
            !due
              ? { kind: 'NO_STEP' }
              : done.mode === 'TRIP'
                ? { kind: 'STEP', place: done.next!.placeName ?? '', due }
                : { kind: 'ALL_GOOD', due },
            smsLang(done.language),
          ),
        );
        return { matched: true as const, action: 'watch_confirmed' };
      },
    };
  }

  private questionRequest(
    phone: string,
    question: OpenAlertQuestion,
  ): SmsRequest {
    const kind = question.kind as AlertQuestionKind;
    const code = replyCode(SMS_CATEGORY.ALERT_QUESTION, question.smsSlot ?? 1);
    return {
      name: question.alertParticipant.alert.userCompanion.firstName,
      answered: question.response !== null,
      code,
      choices: (lang) => alertReplyChoicesText(kind, lang, code),
      answer: (reply) =>
        this.outerCircles.answerQuestion(question, phone, reply),
    };
  }

  private invitationRequest(link: LinkWithParties): SmsRequest {
    const code = replyCode(SMS_CATEGORY.INVITATION, link.smsSlot ?? 1);
    return {
      name: link.userCompanion.firstName,
      answered: false,
      code,
      choices: (lang) =>
        lang === 'en'
          ? `${code}1 Yes, ${code}2 No`
          : `${code}1 Oui, ${code}2 Non`,
      answer: async (reply) => {
        const digit = reply.trim();
        const intent =
          digit === '1'
            ? 'accept'
            : digit === '2'
              ? 'decline'
              : parseSmsReply(reply);
        if (intent === 'unknown') return null;
        return this.answerInvitation(link, intent === 'accept');
      },
    };
  }

  private async answerInvitation(link: LinkWithParties, accept: boolean) {
    await this.sentinel.answerInvitation(link, accept);
    if (!accept && link.linkAsSentinel.phone) {
      await this.retention.eraseStubIfUnused(link.linkAsSentinel.phone);
    }
    return {
      matched: true as const,
      action: accept ? 'accepted' : 'declined',
    };
  }

  private async handleCommand(phone: string, command: SmsCommand) {
    const links = await this.sentinel.listActiveLinksByPhone(phone);
    const names = links.map((link) => link.userCompanion.firstName);
    const lang = smsLang(links[0]?.linkAsSentinel.language);

    if (command.kind === 'info') {
      if (links.length === 0) return NO_MATCH;
      const hasAccount = links[0].linkAsSentinel.userType !== UserType.ONLY_SMS;
      await this.sms.send(phone, sentinelInfoSms(names, hasAccount, lang));
      return { matched: true as const, action: 'info_sent' };
    }

    if (links.length === 0) {
      const [invitation] = await this.sentinel.listInvitationsByPhone(phone);
      return invitation ? this.answerInvitation(invitation, false) : NO_MATCH;
    }

    const link =
      command.position === null
        ? links.length === 1
          ? links[0]
          : undefined
        : links[command.position - 1];
    if (!link) {
      await this.sms.send(phone, stopChoiceSms(names, lang));
      return { matched: true as const, action: 'stop_choice_sent' };
    }
    const left = await this.sentinel.leaveLinkBySms(link);
    if (left) await this.retention.eraseStubIfUnused(phone);
    return { matched: true as const, action: left ? 'left' : 'last_lead_kept' };
  }

  // Only a known Sentinel gets an answer: replying to any number would mean
  // paying for an SMS to whoever writes.
  private async sendHelpOncePerDay(phone: string) {
    const links = await this.sentinel.listActiveLinksByPhone(phone);
    if (links.length === 0) return NO_MATCH;

    const lastSent = this.lastHelpSentAt.get(phone) ?? 0;
    if (Date.now() - lastSent < HELP_SMS_INTERVAL_MS) return NO_MATCH;

    this.lastHelpSentAt.set(phone, Date.now());
    await this.sms.send(
      phone,
      smsHelpSms(smsLang(links[0]?.linkAsSentinel.language)),
    );
    return { matched: true as const, action: 'help_sent' };
  }
}
