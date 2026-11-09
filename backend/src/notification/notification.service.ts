import { Inject, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.interface';
import { PUSH_SENDER } from './push-sender.interface';
import type { PushSender } from './push-sender.interface';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  actorUserId?: string;
  actorLabel?: string;
  accepted?: boolean;
  targetId?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  // Skips the write when the recipient is also the actor — nobody needs
  // telling about their own action (e.g. sending their own message).
  async create(input: CreateNotificationInput) {
    if (input.userId === input.actorUserId) return null;

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        actorUserId: input.actorUserId,
        actorLabel: input.actorLabel,
        accepted: input.accepted,
        targetId: input.targetId,
      },
    });

    this.realtime.notifyNotificationNew(input.userId);
    await this.push.send(input.userId, {
      id: notification.id,
      type: notification.type,
    });

    return notification;
  }

  // Unread only — a notification disappears once read (clicked, or its
  // conversation opened); there's no history of old ones. New messages are
  // left out: they're surfaced on the Messages tab, not in the bell.
  // actorGender: how the text speaks about whoever triggered it ("Léa est
  // passée dans votre réserve"); null = inclusive wording.
  async listMine(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        readAt: null,
        type: { not: NotificationType.NEW_MESSAGE },
      },
      include: { actor: { select: { gender: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(({ actor, ...n }) => ({
      ...n,
      actorGender: actor?.gender ?? null,
    }));
  }

  // Split the same way: `count` feeds the bell (everything but messages),
  // `messages` feeds the Messages tab's badge, and `support` — replies in
  // the caller's feedback thread (supportConversationId, see
  // SupportService) — the About tab's, since that thread isn't in Messages.
  // Messages count **conversations** with something unread, not messages:
  // 3 messages from one person = 1, 2 people writing = 2.
  async getUnreadCounts(userId: string, supportConversationId: string | null) {
    const [count, unreadConversations] = await Promise.all([
      this.prisma.notification.count({
        where: {
          userId,
          readAt: null,
          type: { not: NotificationType.NEW_MESSAGE },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId, readAt: null, type: NotificationType.NEW_MESSAGE },
        distinct: ['targetId'],
        select: { targetId: true },
      }),
    ]);
    const support = unreadConversations.filter(
      (n) =>
        supportConversationId !== null && n.targetId === supportConversationId,
    ).length;
    // Only conversations the Messages page lists: an alert's chat lives on
    // the Running Alert page and can't be opened once the alert is over, so
    // its unread rows would otherwise keep the badge lit forever.
    const targetIds = unreadConversations
      .map((n) => n.targetId)
      .filter((id): id is string => id !== null);
    const direct =
      targetIds.length === 0
        ? 0
        : await this.prisma.conversation.count({
            where: { id: { in: targetIds }, alertId: null },
          });
    return {
      count,
      messages: Math.max(0, direct - support),
      support,
    };
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // Per-conversation unread counts, for MessagesPage's contact badges —
  // reuses NEW_MESSAGE notifications instead of a separate read-state table.
  async getUnreadCountsByTarget(
    userId: string,
    targetIds: string[],
  ): Promise<Record<string, number>> {
    if (targetIds.length === 0) return {};
    const rows = await this.prisma.notification.groupBy({
      by: ['targetId'],
      where: {
        userId,
        type: NotificationType.NEW_MESSAGE,
        readAt: null,
        targetId: { in: targetIds },
      },
      _count: { targetId: true },
    });
    return Object.fromEntries(
      rows.map((r) => [r.targetId as string, r._count.targetId]),
    );
  }

  // Marks every unread notification of this type for this target as read in
  // one go — e.g. opening a conversation clears all its NEW_MESSAGE rows.
  markTargetRead(userId: string, type: NotificationType, targetId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, type, targetId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
