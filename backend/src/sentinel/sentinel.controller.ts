import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SentinelService } from './sentinel.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { AcceptMembershipDto } from './dto/accept-membership.dto';

@UseGuards(JwtAuthGuard)
@Controller('sentinel')
export class SentinelController {
  constructor(private readonly sentinel: SentinelService) {}

  // ---- Circles --------------------------------------------------------------

  @Post('circles')
  createCircle(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCircleDto,
  ) {
    return this.sentinel.createCircle(user.userId, dto);
  }

  @Get('circles')
  listCircles(@CurrentUser() user: { userId: string }) {
    return this.sentinel.listCircles(user.userId);
  }

  @Patch('circles/:id')
  updateCircle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCircleDto,
  ) {
    return this.sentinel.updateCircle(user.userId, id, dto);
  }

  @Delete('circles/:id')
  deleteCircle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.sentinel.deleteCircle(user.userId, id);
  }

  // ---- Invitations & requests -----------------------------------------------

  // "Me" invites someone into a circle as a Sentinel (site only).
  @Post('circles/:id/invite')
  invite(
    @CurrentUser() user: { userId: string },
    @Param('id') circleId: string,
    @Body() dto: InviteSentinelDto,
  ) {
    return this.sentinel.inviteSentinel(user.userId, circleId, dto);
  }

  // I ask to become a Sentinel for the "Me" at targetPhone (site only).
  @Post('requests')
  request(
    @CurrentUser() user: { userId: string },
    @Body() dto: RequestSentinelDto,
  ) {
    return this.sentinel.requestToBeSentinel(user.userId, dto);
  }

  // Requests from people who want to be my Sentinel, awaiting my approval.
  @Get('requests')
  incomingRequests(@CurrentUser() user: { userId: string }) {
    return this.sentinel.listIncomingRequests(user.userId);
  }

  // Invitations addressed to me (I'm the invited Sentinel), awaiting my answer.
  @Get('invitations')
  myInvitations(@CurrentUser() user: { userId: string }) {
    return this.sentinel.listMyInvitations(user.userId);
  }

  // ---- Respond (site) -------------------------------------------------------

  @Post('memberships/:id/accept')
  accept(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AcceptMembershipDto,
  ) {
    return this.sentinel.respondToMembership(
      user.userId,
      id,
      true,
      dto.circleId,
    );
  }

  @Post('memberships/:id/decline')
  decline(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sentinel.respondToMembership(user.userId, id, false);
  }

  // A Sentinel with an account opts out of an active link (also doable by SMS).
  @Post('memberships/:id/leave')
  leave(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sentinel.leaveMembershipAsSentinel(user.userId, id);
  }

  // A Sentinel answers a proposed move into the 1st circle (also doable by SMS).
  @Post('memberships/:id/circle-move/accept')
  acceptCircleMove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sentinel.respondToCircleMove(user.userId, id, true);
  }

  @Post('memberships/:id/circle-move/decline')
  declineCircleMove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sentinel.respondToCircleMove(user.userId, id, false);
  }

  // ---- Membership management (owner side) -----------------------------------

  @Patch('memberships/:id')
  updateMembership(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.sentinel.updateMembership(user.userId, id, dto);
  }

  @Delete('memberships/:id')
  removeMembership(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.sentinel.removeMembership(user.userId, id);
  }

  // "Me" only — ends the link permanently (never reactivatable), unlike
  // decline/remove.
  @Post('memberships/:id/block')
  block(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sentinel.blockMembership(user.userId, id);
  }

  // ---- Companions (people I watch over) -------------------------------------

  @Get('companions')
  companions(@CurrentUser() user: { userId: string }) {
    return this.sentinel.listCompanions(user.userId);
  }
}
