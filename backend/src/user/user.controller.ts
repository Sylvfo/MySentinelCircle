import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import type { Express, Response } from 'express';
import { finalizeImageUpload } from '../common/image-upload';
import { randomUUID } from 'crypto';
import { UserService, AVATAR_DIR } from './user.service';
import { AccountDeletionService } from './account-deletion.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { AddPhoneDto } from './dto/add-phone.dto';
import { VerifyAddPhoneDto } from './dto/verify-add-phone.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StepUpPasswordDto } from './dto/step-up-password.dto';
import { StepUpGoogleDto } from './dto/step-up-google.dto';
import { StepUpCodeRequestDto } from './dto/step-up-code-request.dto';
import { StepUpCodeVerifyDto } from './dto/step-up-code-verify.dto';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { DevSetHasPaidDto } from './dto/dev-set-has-paid.dto';
import { UpdateDeathNoticeDto } from './dto/update-death-notice.dto';
import { SetDeathNoticeRecipientsDto } from './dto/set-death-notice-recipients.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

mkdirSync(AVATAR_DIR, { recursive: true });

const AVATAR_MIME_TYPES = /^image\/(jpeg|png|webp)$/;

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.userService.getProfile(user.userId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete('me')
  deleteAccount(@CurrentUser() user: { userId: string }) {
    return this.accountDeletion.deleteAccount(user.userId);
  }

  @Post('me/complete-profile')
  completeProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: CompleteProfileDto,
  ) {
    return this.userService.completeProfile(user.userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('phone/request')
  requestAddPhone(
    @CurrentUser() user: { userId: string },
    @Body() dto: AddPhoneDto,
  ) {
    return this.userService.requestAddPhone(user.userId, dto.phone);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('phone/verify')
  verifyAddPhone(
    @CurrentUser() user: { userId: string },
    @Body() dto: VerifyAddPhoneDto,
  ) {
    return this.userService.verifyAddPhone(user.userId, dto.code);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/set-password')
  setPassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetPasswordDto,
  ) {
    return this.userService.setPassword(user.userId, dto.newPassword);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/change-password')
  changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/step-up/password')
  stepUpPassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpPasswordDto,
  ) {
    return this.userService.stepUpPassword(user.userId, dto.password);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/step-up/google')
  stepUpGoogle(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpGoogleDto,
  ) {
    return this.userService.stepUpGoogle(user.userId, dto.idToken);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/step-up/code/request')
  stepUpCodeRequest(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpCodeRequestDto,
  ) {
    return this.userService.stepUpCodeRequest(user.userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/step-up/code/verify')
  stepUpCodeVerify(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpCodeVerifyDto,
  ) {
    return this.userService.stepUpCodeVerify(user.userId, dto.code);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/change-email/request')
  requestEmailChange(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangeEmailRequestDto,
  ) {
    return this.userService.requestEmailChange(user.userId, dto.newEmail);
  }

  // TEMPORARY dev/test affordance — stands in for a real payment provider.
  @Post('me/dev-has-paid')
  devSetHasPaid(
    @CurrentUser() user: { userId: string },
    @Body() dto: DevSetHasPaidDto,
  ) {
    return this.userService.devSetHasPaid(user.userId, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: AVATAR_DIR,
        // Random name: unguessable, and a new photo gets a new name, so
        // nothing stale is served from a cache after a change.
        filename: (_req, file, cb) => {
          // Extension added once the bytes are checked (finalizeImageUpload).
          cb(null, randomUUID());
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!AVATAR_MIME_TYPES.test(file.mimetype)) {
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
  async uploadAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const filename = await finalizeImageUpload(file);
    return this.userService.setAvatar(user.userId, filename);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: { userId: string }) {
    return this.userService.removeAvatar(user.userId);
  }

  // Private photo, served only to its owner and the people linked to them
  // (see UserService.getAvatarFile). No throttle: a list page loads one
  // small image per person, which would eat the shared per-IP budget.
  @SkipThrottle()
  @Get(':id/avatar')
  async getAvatar(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.userService.getAvatarFile(user.userId, id);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(file);
  }

  // ---- Death notice (prepared while alive) ----------------------------------

  @Get('death-notice')
  getMyDeathNotice(@CurrentUser() user: { userId: string }) {
    return this.userService.getMyDeathNotice(user.userId);
  }

  @Patch('death-notice')
  updateMyDeathNotice(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateDeathNoticeDto,
  ) {
    return this.userService.updateMyDeathNotice(user.userId, dto);
  }

  @Patch('death-notice/recipients')
  setDeathNoticeRecipients(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetDeathNoticeRecipientsDto,
  ) {
    return this.userService.setDeathNoticeRecipients(user.userId, dto);
  }
}
