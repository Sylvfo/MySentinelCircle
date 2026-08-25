import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import type { Express } from 'express';
import { UserService, AVATAR_DIR } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddPhoneDto } from './dto/add-phone.dto';
import { VerifyAddPhoneDto } from './dto/verify-add-phone.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StepUpPasswordDto } from './dto/step-up-password.dto';
import { StepUpGoogleDto } from './dto/step-up-google.dto';
import { StepUpCodeRequestDto } from './dto/step-up-code-request.dto';
import { StepUpCodeVerifyDto } from './dto/step-up-code-verify.dto';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

mkdirSync(AVATAR_DIR, { recursive: true });

const AVATAR_MIME_TYPES = /^image\/(jpeg|png|webp)$/;

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/request')
  requestAddPhone(
    @CurrentUser() user: { userId: string },
    @Body() dto: AddPhoneDto,
  ) {
    return this.userService.requestAddPhone(user.userId, dto.phone);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/verify')
  verifyAddPhone(
    @CurrentUser() user: { userId: string },
    @Body() dto: VerifyAddPhoneDto,
  ) {
    return this.userService.verifyAddPhone(user.userId, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/change-password')
  changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/step-up/password')
  stepUpPassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpPasswordDto,
  ) {
    return this.userService.stepUpPassword(user.userId, dto.password);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/step-up/google')
  stepUpGoogle(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpGoogleDto,
  ) {
    return this.userService.stepUpGoogle(user.userId, dto.idToken);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/step-up/code/request')
  stepUpCodeRequest(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpCodeRequestDto,
  ) {
    return this.userService.stepUpCodeRequest(user.userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/step-up/code/verify')
  stepUpCodeVerify(
    @CurrentUser() user: { userId: string },
    @Body() dto: StepUpCodeVerifyDto,
  ) {
    return this.userService.stepUpCodeVerify(user.userId, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/change-email/request')
  requestEmailChange(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangeEmailRequestDto,
  ) {
    return this.userService.requestEmailChange(user.userId, dto.newEmail);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: AVATAR_DIR,
        filename: (req, file, cb) => {
          const user = (req as unknown as { user: { userId: string } }).user;
          cb(null, `${user.userId}${extname(file.originalname)}`);
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
  uploadAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.setAvatar(user.userId, file.filename);
  }
}
