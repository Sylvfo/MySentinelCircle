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

  listMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
