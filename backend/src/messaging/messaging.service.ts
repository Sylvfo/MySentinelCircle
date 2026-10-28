import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { MessageType, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { SendMessageDto } from './dto/send-message.dto';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sentinel: SentinelService,
    @Inject(REALTIME_NOTIFIER) private readonly notifier: RealtimeNotifier,
    private readonly notifications: NotificationService,
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
    const allowed = await this.sentinel.canSendDirectMessage(
      callerId,
      targetUserId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Messaging is not currently allowed between you two',
      );
    }

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

    return participations
      .filter((p) => p.conversation.participants.length > 0)
      .map((p) => {
        const other = p.conversation.participants[0];
        const lastMessage = p.conversation.messages[0] ?? null;
        return {
          conversationId: p.conversation.id,
          otherUserId: other.userId,
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
    const allowed = await this.sentinel.canSendDirectMessage(
      userId,
      other.userId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Messaging is not currently allowed between you two',
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
