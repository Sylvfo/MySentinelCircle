import { Inject, Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { OuterCirclesService } from '../alert/outer-circles.service';
import type { OpenAlertQuestion } from '../alert/outer-circles.service';
import { repliesFor } from '../alert/alert-replies';
import type { AlertQuestionKind } from '../alert/alert-replies';
import {
  parseSmsCommand,
  parseSmsReply,
  sentinelInfoSms,
  severalRequestsSms,
  smsHelpSms,
  stopChoiceSms,
} from '../sms/messages';
import type { SmsCommand } from '../sms/messages';
import { findReplyTarget } from '../sms/sms-reply-target';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import { RetentionService } from '../privacy/retention.service';
import { SentinelService } from './sentinel.service';
import type { LinkWithParties } from './sentinel.service';

const HELP_SMS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NO_MATCH = { matched: false as const, reason: 'no_actionable_link' };

type SmsResult = { matched: true; action: string };

// Something this number can answer: an alert question or an invitation.
interface SmsRequest {
  name: string;
  answered: boolean;
  exampleReply: string;
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
    private readonly retention: RetentionService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async handle(from: string, body: string) {
    const phone = from.trim();

    const command = parseSmsCommand(body);
    if (command) return this.handleCommand(phone, command);

    const requests = await this.listRequests(phone);
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
      await this.sms.send(
        phone,
        severalRequestsSms(
          candidates.map(({ name, exampleReply }) => `${name} ${exampleReply}`),
        ),
      );
      return { matched: true as const, action: 'several_requests' };
    }

    const result = await candidates[0]?.answer(body);
    return result ?? this.sendHelpOncePerDay(phone);
  }

  // Alerts first, being more urgent, newest first.
  private async listRequests(phone: string): Promise<SmsRequest[]> {
    const [questions, invitations] = await Promise.all([
      this.outerCircles.listOpenQuestionsByPhone(phone),
      this.sentinel.listInvitationsByPhone(phone),
    ]);
    return [
      ...questions.map((question) => this.questionRequest(phone, question)),
      ...invitations.map((link) => this.invitationRequest(link)),
    ];
  }

  private questionRequest(
    phone: string,
    question: OpenAlertQuestion,
  ): SmsRequest {
    const kind = question.kind as AlertQuestionKind;
    return {
      name: question.alertParticipant.alert.userCompanion.firstName,
      answered: question.response !== null,
      exampleReply: repliesFor(kind).length > 0 ? '1' : 'votre reponse',
      answer: (reply) =>
        this.outerCircles.answerQuestion(question, phone, reply),
    };
  }

  private invitationRequest(link: LinkWithParties): SmsRequest {
    return {
      name: link.userCompanion.firstName,
      answered: false,
      exampleReply: 'OUI',
      answer: async (reply) => {
        const intent = parseSmsReply(reply);
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

    if (command.kind === 'info') {
      if (links.length === 0) return NO_MATCH;
      const hasAccount = links[0].linkAsSentinel.userType !== UserType.ONLY_SMS;
      await this.sms.send(phone, sentinelInfoSms(names, hasAccount));
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
      await this.sms.send(phone, stopChoiceSms(names));
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
    await this.sms.send(phone, smsHelpSms());
    return { matched: true as const, action: 'help_sent' };
  }
}
