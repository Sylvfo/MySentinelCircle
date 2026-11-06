import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, NotificationType, UserStatus } from '@prisma/client';
import { basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { SendMessageDto } from './dto/send-message.dto';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';
import { SupportService } from '../support/support.service';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sentinel: SentinelService,
    @Inject(REALTIME_NOTIFIER) private readonly notifier: RealtimeNotifier,
    private readonly notifications: NotificationService,
    private readonly support: SupportService,
  ) {}

  // The permanent Me<->Sentinel channel — "created lazily... only when the
  // first message is sent" (plan.txt): finds the existing 1:1 Conversation
  // between caller and target, or creates it, gated by
  // SentinelService.canSendDirectMessage(). Alert-scoped conversations
  // (alertId set) are never matched here — those are alert's own concern.
  async getOrCreateDirectConversation(callerId: string, targetUserId: string) {
    if (callerId === targetUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const allowed =
      (await this.isSupportPair(callerId, targetUserId)) ||
      (await this.sentinel.canSendDirectMessage(callerId, targetUserId));
    if (!allowed) {
      throw new ForbiddenException(
        'Messaging is not currently allowed between you two',
      );
    }
    return this.findOrCreateDirect(callerId, targetUserId);
  }

  // The caller's conversation with the feedback inbox (see SupportService),
  // found or created — open to every account, no Sentinel link needed.
  async getOrCreateSupportConversation(callerId: string) {
    const supportId = await this.support.getSupportUserId();
    if (!supportId) {
      throw new NotFoundException('Feedback is not available');
    }
    if (supportId === callerId) {
      throw new BadRequestException('The feedback inbox has no own thread');
    }
    return this.findOrCreateDirect(callerId, supportId);
  }

  // Either side is the feedback inbox: allowed whatever the circles say —
  // anyone may write to it, and it may answer anyone who wrote.
  private async isSupportPair(a: string, b: string) {
    const supportId = await this.support.getSupportUserId();
    return supportId !== null && (a === supportId || b === supportId);
  }

  private async findOrCreateDirect(callerId: string, targetUserId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        alertId: null,
        AND: [
          { participants: { some: { userId: callerId, leftAt: null } } },
          { participants: { some: { userId: targetUserId, leftAt: null } } },
        ],
      },
      select: { id: true, closedAt: true },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: callerId }, { userId: targetUserId }],
        },
      },
      select: { id: true, closedAt: true },
    });
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    return this.createMessage(
      userId,
      conversationId,
      dto.body,
      MessageType.TEXT,
    );
  }

  // filename only (mirrors User.avatarPath storing just a filename, not a
  // URL) — the caller already saved it under uploads/messages/ via multer.
  async sendImageMessage(
    userId: string,
    conversationId: string,
    filename: string,
  ) {
    return this.createMessage(
      userId,
      conversationId,
      filename,
      MessageType.IMAGE,
    );
  }

  private async createMessage(
    userId: string,
    conversationId: string,
    body: string,
    type: MessageType,
  ) {
    const conversation = await this.assertActiveParticipant(
      userId,
      conversationId,
    );
    await this.assertNoDeceasedParticipant(conversationId);
    if (conversation.closedAt) {
      throw new ConflictException('This conversation is closed');
    }
    // Alert-scoped conversations lock on close (checked above); a direct
    // (alertId null) one can also be cut off by a messaging-settings
    // change after the fact — re-resolve on every send, not just at
    // creation, so turning the setting off takes effect right away.
    if (conversation.alertId === null) {
      await this.assertDirectMessagingAllowed(userId, conversationId);
    }
    const message = await this.prisma.message.create({
      data: { body, type, senderId: userId, conversationId },
    });

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    for (const p of participants) {
      this.notifier.notifyNewMessage(p.userId, conversationId);
      if (p.userId !== userId) {
        await this.notifications.create({
          userId: p.userId,
          type: NotificationType.NEW_MESSAGE,
          actorUserId: userId,
          targetId: conversationId,
        });
      }
    }

    return message;
  }

  // The file name of an IMAGE message, for a participant of its
  // conversation only. 404 (not 403) for anything else, so it doesn't say
  // whether the message exists.
  async getMessageImageFile(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { type: true, body: true, conversationId: true },
    });
    if (!message || message.type !== MessageType.IMAGE) {
      throw new NotFoundException('No image');
    }
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('No image');
    // Our own random name, but never trust it as a path.
    return basename(message.body);
  }

  async listMessages(userId: string, conversationId: string) {
    await this.assertActiveParticipant(userId, conversationId);
    // Viewing a conversation counts as reading it — clears both the bell's
    // unread count and MessagesPage's per-contact badge together, no
    // separate "mark read" action needed.
    await this.notifications.markTargetRead(
      userId,
      NotificationType.NEW_MESSAGE,
      conversationId,
    );
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Every direct (non-alert) conversation I'm an active participant of,
  // each with the other side's name, its latest message, and my unread
  // count — what MessagesPage needs to sort contacts by recency and show
  // a badge, without a separate round trip per contact.
  async listMyConversations(userId: string) {
    const participations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        leftAt: null,
        conversation: { alertId: null },
      },
      select: {
        conversation: {
          select: {
            id: true,
            participants: {
              where: { userId: { not: userId }, leftAt: null },
              select: { userId: true, user: { select: { firstName: true } } },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, type: true, createdAt: true },
            },
          },
        },
      },
    });

    const conversationIds = participations.map((p) => p.conversation.id);
    const unreadCounts = await this.notifications.getUnreadCountsByTarget(
      userId,
      conversationIds,
    );

    // A user's feedback thread lives on the feedback page, not in Messages
    // (the support account itself, though, sees all of them here).
    const supportId = await this.support.getSupportUserId();

    return participations
      .filter((p) => p.conversation.participants.length > 0)
      .filter(
        (p) =>
          supportId === null ||
          userId === supportId ||
          p.conversation.participants[0].userId !== supportId,
      )
      .map((p) => {
        const other = p.conversation.participants[0];
        const lastMessage = p.conversation.messages[0] ?? null;
        return {
          conversationId: p.conversation.id,
          otherUserId: other.userId,
          // For people outside my circles (the support account's inbox):
          // the list has no other way to name them.
          otherFirstName: other.user.firstName,
          lastMessage,
          unreadCount: unreadCounts[p.conversation.id] ?? 0,
        };
      });
  }

  private async assertDirectMessagingAllowed(
    userId: string,
    conversationId: string,
  ) {
    const other = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId }, leftAt: null },
      select: { userId: true },
    });
    if (!other) return; // defensive — shouldn't happen for a direct conversation
    const allowed =
      (await this.isSupportPair(userId, other.userId)) ||
      (await this.sentinel.canSendDirectMessage(userId, other.userId));
    if (!allowed) {
      throw new ForbiddenException(
        'Messaging is not currently allowed between you two',
      );
    }
  }

  // Existing messages stay readable (listMessages is untouched) — only
  // sending a new one is blocked once any active participant is deceased.
  private async assertNoDeceasedParticipant(conversationId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
      select: { user: { select: { status: true } } },
    });
    if (participants.some((p) => p.user.status === UserStatus.DECEASED)) {
      throw new ForbiddenException(
        'This conversation includes a deceased participant — no new messages can be sent',
      );
    }
    if (participants.some((p) => p.user.status === UserStatus.DELETED)) {
      throw new ForbiddenException(
        'This conversation includes a deleted account — no new messages can be sent',
      );
    }
  }

  private async assertActiveParticipant(
    userId: string,
    conversationId: string,
  ) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId, leftAt: null },
      include: { conversation: { select: { closedAt: true, alertId: true } } },
    });
    if (!participant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }
    return participant.conversation;
  }
}
