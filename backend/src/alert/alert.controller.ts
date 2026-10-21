import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AlertService } from './alert.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@UseGuards(JwtAuthGuard)
@Controller('alert')
export class AlertController {
  constructor(private readonly alert: AlertService) {}

  // Not POST/GET on the bare /alert root — nginx's reverse-proxy location
  // blocks for every backend module require a trailing path segment (see
  // nginx/nginx.conf), so Alert's routes avoid the collection root too.
  @Post('raise')
  raise(@CurrentUser() user: { userId: string }, @Body() dto: CreateAlertDto) {
    return this.alert.raiseAlert(user.userId, dto);
  }

  @Post(':id/close')
  close(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.alert.closeAlert(user.userId, id);
  }

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.alert.listMyAlerts(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.alert.getAlert(user.userId, id);
  }
}
