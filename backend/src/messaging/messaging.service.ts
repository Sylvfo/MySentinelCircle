import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.assertActiveParticipant(
      userId,
      conversationId,
    );
    if (conversation.closedAt) {
      throw new ConflictException('This conversation is closed');
    }
    return this.prisma.message.create({
      data: { body: dto.body, senderId: userId, conversationId },
    });
  }

  async listMessages(userId: string, conversationId: string) {
    await this.assertActiveParticipant(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertActiveParticipant(
    userId: string,
    conversationId: string,
  ) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId, leftAt: null },
      include: { conversation: { select: { closedAt: true } } },
    });
    if (!participant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }
    return participant.conversation;
  }
}
