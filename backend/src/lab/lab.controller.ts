import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { finalizeImageUpload } from '../common/image-upload';
import { LabService } from './lab.service';

export const LAB_SCREENSHOT_DIR = join(process.cwd(), 'uploads', 'lab');
mkdirSync(LAB_SCREENSHOT_DIR, { recursive: true });

class LabLoginDto {
  @IsString()
  @MaxLength(191)
  identifier: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

class LabPhoneDto {
  @IsString()
  @MaxLength(32)
  phone: string;
}

class LabReplyDto extends LabPhoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  body: string;
}

class LabAdvanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  hours: number;
}

class LabFeedbackDto {
  @IsString()
  @MaxLength(64)
  scenario: string;

  @IsString()
  @MaxLength(191)
  tags: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;
}

// Under /user/ like the admin page: nginx already forwards it. Only where
// ALLOW_DEV_ROUTES is on (LabService.assertEnabled). A tester signs in to
// the lab with their account (POST login); every other lab route takes
// the lab token in the X-Lab-Token header and only reaches their own phones.
// Not counted in the app's rate limit: the lab's four screens poll their
// SMS, and its routes don't exist outside dev.
@SkipThrottle()
@Controller('user/lab')
export class LabController {
  constructor(private readonly lab: LabService) {}

  @Post('login')
  login(@Body() dto: LabLoginDto) {
    return this.lab.login(dto.identifier, dto.password);
  }

  @Get('me')
  async me(@Headers('x-lab-token') token?: string) {
    const tester = await this.lab.tester(token);
    return { testerName: tester.name, phones: tester.phones };
  }

  @Post('login-as')
  loginAs(@Headers('x-lab-token') token: string, @Body() dto: LabPhoneDto) {
    return this.lab.loginAs(token, dto.phone);
  }

  @Get('sms/all')
  smsAll(@Headers('x-lab-token') token: string) {
    return this.lab.smsAll(token);
  }

  @Get('sms')
  sms(@Headers('x-lab-token') token: string, @Query() dto: LabPhoneDto) {
    return this.lab.sms(token, dto.phone);
  }

  @Post('sms')
  reply(@Headers('x-lab-token') token: string, @Body() dto: LabReplyDto) {
    return this.lab.reply(token, dto.phone, dto.body);
  }

  @Post('advance')
  advance(@Headers('x-lab-token') token: string, @Body() dto: LabAdvanceDto) {
    return this.lab.advance(token, dto.hours);
  }

  @Post('reset')
  reset(@Headers('x-lab-token') token: string) {
    return this.lab.reset(token);
  }

  @Post('feedback')
  @UseInterceptors(
    FileInterceptor('screenshot', {
      storage: diskStorage({
        destination: LAB_SCREENSHOT_DIR,
        filename: (_req, _file, cb) => cb(null, randomUUID()),
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
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
  async feedback(
    @Headers('x-lab-token') token: string,
    @Body() dto: LabFeedbackDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const screenshotPath = file ? await finalizeImageUpload(file) : undefined;
    return this.lab.feedback(token, { ...dto, screenshotPath });
  }

  // ---- Admin page: the testers' opinions ----

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/feedback')
  listFeedback() {
    return this.lab.listFeedback();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/feedback/:id/screenshot')
  async screenshot(@Param('id') id: string, @Res() res: Response) {
    const row = await this.lab.findFeedback(id);
    if (!row.screenshotPath) throw new BadRequestException('No screenshot');
    res.sendFile(join(LAB_SCREENSHOT_DIR, row.screenshotPath));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/feedback/:id/read')
  markRead(@Param('id') id: string) {
    return this.lab.markRead(id);
  }
}
