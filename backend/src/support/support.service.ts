import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// The feedback ("Give feedback") inbox is an ordinary account, designated
// by SUPPORT_EMAIL in backend/.env. Feedback is just a direct conversation
// with it, reusing the generic messaging model — no Feedback table. Users
// never see this account as a contact: their conversation with it lives on
// the feedback page only (see MessagingService.listMyConversations and
// NotificationService.getUnreadCounts), while the account itself reads
// every feedback conversation in its own Messages.
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Looked up on each call (unique index, cheap): no stale cache if the
  // account is created or SUPPORT_EMAIL changed after boot. null = feedback
  // isn't set up on this instance.
  async getSupportUserId(): Promise<string | null> {
    const email = this.config.get<string>('SUPPORT_EMAIL')?.trim();
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  // The caller's feedback conversation, if one exists yet (null for the
  // support account itself: it has no "own" one, it has all of them).
  async findSupportConversationId(userId: string): Promise<string | null> {
    const supportId = await this.getSupportUserId();
    if (!supportId || supportId === userId) return null;
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        alertId: null,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: supportId } } },
        ],
      },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }
}
