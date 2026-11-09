import { CloseAlertDto } from './dto/close-alert.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AlertService } from './alert.service';
import { AlertLocationDto, CreateAlertDto } from './dto/create-alert.dto';
import { AskQuestionDto } from './dto/ask-question.dto';
import { RequestCircleDto } from './dto/request-circle.dto';
import { RespondAlertDto } from './dto/respond-alert.dto';
import { UpdateAlertStatusDto } from './dto/update-alert-status.dto';
import { UpdateAlertLabelDto } from './dto/update-alert-label.dto';
import { OuterCirclesService } from './outer-circles.service';

@UseGuards(JwtAuthGuard)
@Controller('alert')
export class AlertController {
  constructor(
    private readonly alert: AlertService,
    private readonly outerCircles: OuterCirclesService,
  ) {}

  // Not POST/GET on the bare /alert root — nginx's reverse-proxy location
  // blocks for every backend module require a trailing path segment (see
  // nginx/nginx.conf), so Alert's routes avoid the collection root too.
  @Post('raise')
  raise(@CurrentUser() user: { userId: string }, @Body() dto: CreateAlertDto) {
    return this.alert.raiseAlert(user.userId, dto);
  }

  // Optional closing word (status, chats and the end-of-alert SMS).
  @Post(':id/close')
  close(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CloseAlertDto,
  ) {
    return this.alert.closeAlert(user.userId, id, dto.finalWord);
  }

  @Post(':id/claim-lead')
  claimLead(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.alert.claimLead(user.userId, id);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.alert.leaveAlert(user.userId, id);
  }

  @Post(':id/request-circle')
  requestCircle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RequestCircleDto,
  ) {
    return this.outerCircles.requestCircle(user.userId, id, dto);
  }

  @Post(':id/questions')
  askQuestion(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AskQuestionDto,
  ) {
    return this.outerCircles.askQuestion(user.userId, id, dto);
  }

  @Post(':id/respond')
  respond(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RespondAlertDto,
  ) {
    return this.outerCircles.respond(user.userId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    return this.alert.updateStatus(user.userId, id, dto);
  }

  // The person the alert is about shares an updated GPS position.
  @Patch(':id/location')
  updateLocation(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AlertLocationDto,
  ) {
    return this.alert.updateLocation(user.userId, id, dto);
  }

  @Patch(':id/label')
  updateLabel(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAlertLabelDto,
  ) {
    return this.alert.updateLabel(user.userId, id, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.alert.listMyAlerts(user.userId);
  }

  @Get(':id/my-participation')
  getMyParticipation(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.alert.getMyParticipation(user.userId, id);
  }

  @Get(':id/circle-chat')
  getCircleChat(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.alert.getOrCreateCircleChat(user.userId, id);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.alert.getAlert(user.userId, id);
  }
}
