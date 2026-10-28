import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

const MESSAGE_IMAGE_DIR = join(process.cwd(), 'uploads', 'messages');
mkdirSync(MESSAGE_IMAGE_DIR, { recursive: true });

const IMAGE_MIME_TYPES = /^image\/(jpeg|png|webp)$/;

@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  // Every direct conversation I'm in, with the other side's name, last
  // message, and unread count — what MessagesPage sorts/badges contacts by.
  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.messaging.listMyConversations(user.userId);
  }

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

  // Each image is its own permanent message, unlike the avatar upload —
  // filename is a fresh randomUUID() per upload, nothing ever deleted.
  @Post('conversations/:id/messages/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: MESSAGE_IMAGE_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!IMAGE_MIME_TYPES.test(file.mimetype)) {
          cb(
            new BadRequestException('Only jpg/png/webp images are allowed'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  sendImage(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.messaging.sendImageMessage(user.userId, id, file.filename);
  }

  @Get('conversations/:id/messages')
  list(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.messaging.listMessages(user.userId, id);
  }
}
