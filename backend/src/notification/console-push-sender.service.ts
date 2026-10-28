import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PushSender } from './push-sender.interface';

// Dev stub — logs instead of sending. Swap for an FCM/APNs-backed
// implementation of PushSender once a real mobile app exists.
@Injectable()
export class ConsolePushSenderService implements PushSender {
  private readonly logger = new Logger(ConsolePushSenderService.name);

  send(
    userId: string,
    notification: { id: string; type: NotificationType },
  ): Promise<void> {
    this.logger.log(
      `Push to user ${userId}: [${notification.type}] ${notification.id}`,
    );
    return Promise.resolve();
  }
}
