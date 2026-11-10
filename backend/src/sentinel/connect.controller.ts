import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConnectService } from './connect.service';

class ConnectInviteDto {
  @IsString()
  circleId: string;
}

// The QR code page (add someone): my code, and what scanning someone's
// code leads to. By phone number, the usual invite / request routes.
@UseGuards(JwtAuthGuard)
@Controller('sentinel/connect')
export class ConnectController {
  constructor(private readonly connect: ConnectService) {}

  @Get('mine')
  mine(@CurrentUser() user: { userId: string }) {
    return this.connect.myCode(user.userId);
  }

  @Post('mine/renew')
  renew(@CurrentUser() user: { userId: string }) {
    return this.connect.renew(user.userId);
  }

  @Get(':code')
  resolve(
    @CurrentUser() user: { userId: string },
    @Param('code') code: string,
  ) {
    return this.connect.resolve(user.userId, code);
  }

  @Post(':code/invite')
  invite(
    @CurrentUser() user: { userId: string },
    @Param('code') code: string,
    @Body() dto: ConnectInviteDto,
  ) {
    return this.connect.invite(user.userId, code, dto.circleId);
  }

  @Post(':code/request')
  request(
    @CurrentUser() user: { userId: string },
    @Param('code') code: string,
  ) {
    return this.connect.request(user.userId, code);
  }
}
