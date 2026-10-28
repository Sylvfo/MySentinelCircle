import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  // The permanent Me<->Sentinel channel — finds or lazily creates the 1:1
  // Conversation with :userId. Send/list afterward reuse the routes below.
  @Get('direct/:userId')
  direct(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
  ) {
    return this.messaging.getOrCreateDirectConversation(user.userId, userId);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user.userId, id, dto);
  }

  @Get('conversations/:id/messages')
  list(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.messaging.listMessages(user.userId, id);
  }
}
