import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { finalizeImageUpload } from '../common/image-upload';
import { randomUUID } from 'crypto';
import type { Express, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
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
  // The caller's own feedback thread (Give feedback page).
  @Get('support')
  support(@CurrentUser() user: { userId: string }) {
    return this.messaging.getOrCreateSupportConversation(user.userId);
  }

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
          // Extension added once the bytes are checked (finalizeImageUpload).
          cb(null, randomUUID());
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
  async sendImage(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const filename = await finalizeImageUpload(file);
    try {
      return await this.messaging.sendImageMessage(user.userId, id, filename);
    } catch (err) {
      // Not allowed to post here: don't keep the file.
      await unlink(join(MESSAGE_IMAGE_DIR, filename)).catch(() => undefined);
      throw err;
    }
  }

  // An image sent in a conversation — only for its participants (same rule
  // as reading its messages), never as a public file. No throttle: a
  // conversation loads one request per image.
  @SkipThrottle()
  @Get('messages/:messageId/image')
  async getImage(
    @CurrentUser() user: { userId: string },
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const filename = await this.messaging.getMessageImageFile(
      user.userId,
      messageId,
    );
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(join(MESSAGE_IMAGE_DIR, filename));
  }

  @Get('conversations/:id/messages')
  list(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.messaging.listMessages(user.userId, id);
  }
}
