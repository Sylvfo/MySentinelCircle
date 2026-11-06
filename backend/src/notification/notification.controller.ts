import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { SupportService } from '../support/support.service';

@UseGuards(JwtAuthGuard)
@Controller('notification')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly support: SupportService,
  ) {}

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.notifications.listMine(user.userId);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: { userId: string }) {
    return this.notifications.getUnreadCounts(
      user.userId,
      await this.support.findSupportConversationId(user.userId),
    );
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.notifications.markRead(user.userId, id);
  }
}
