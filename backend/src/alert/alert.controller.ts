import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AlertService } from './alert.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { RequestCircleDto } from './dto/request-circle.dto';
import { RespondAlertDto } from './dto/respond-alert.dto';

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

  @Post(':id/request-circle')
  requestCircle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RequestCircleDto,
  ) {
    return this.alert.requestCircle(user.userId, id, dto);
  }

  @Post(':id/respond')
  respond(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RespondAlertDto,
  ) {
    return this.alert.respond(user.userId, id, dto);
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
