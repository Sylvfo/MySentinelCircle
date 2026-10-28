import { NotificationType } from '@prisma/client';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

// Architecture-ready stand-in for a real device-push provider (FCM/APNs) —
// those need a native app shell that doesn't exist yet. Dev stub logs to
// console; swap the binding in NotificationModule once a real provider
// exists, no caller changes. Mirrors SmsSender's pattern.
export interface PushSender {
  send(
    userId: string,
    notification: { id: string; type: NotificationType },
  ): Promise<void>;
}
