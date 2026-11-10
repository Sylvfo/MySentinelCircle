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
import { WatchService } from './watch.service';
import { TravelCircleService } from './travel-circles.service';
import { WatchViewsService } from './watch-views.service';
import {
  AddTravellerDto,
  CreateTravelCircleDto,
  CreateTripDto,
  EndWatchDto,
  StartAllGoodDto,
  TripStepDto,
  UpdateTripStepDto,
  UpdateWatchDto,
  ValidateWatchDto,
} from './dto/watch.dto';

// Under /alert/ like user/admin is under /user/: nginx only forwards the
// known module prefixes, and a watch is an Alert. No route here is a
// single segment after "watch", so none can be caught by AlertController's
// ":id/<action>" routes.
@UseGuards(JwtAuthGuard)
@Controller('alert/watch')
export class WatchController {
  constructor(
    private readonly watches: WatchService,
    private readonly travel: TravelCircleService,
    private readonly views: WatchViewsService,
  ) {}

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.watches.listMine(user.userId);
  }

  // My own watches with the alerts they opened, and the trips of others I
  // was part of.
  @Get('history')
  history(@CurrentUser() user: { userId: string }) {
    return this.views.history(user.userId);
  }

  // Someone's watches, as far as I may see them (travel circle, or their
  // 1st circle when they share it).
  @Get('of/:companionId')
  of(
    @CurrentUser() user: { userId: string },
    @Param('companionId') companionId: string,
  ) {
    return this.views.viewsFor(user.userId, [companionId]);
  }

  @Post('trip')
  createTrip(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTripDto,
  ) {
    return this.watches.createTrip(user.userId, dto);
  }

  @Post('all-good')
  startAllGood(
    @CurrentUser() user: { userId: string },
    @Body() dto: StartAllGoodDto,
  ) {
    return this.watches.startAllGood(user.userId, dto);
  }

  @Get(':id/details')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.watches.getWatch(user.userId, id);
  }

  @Patch(':id/settings')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateWatchDto,
  ) {
    return this.watches.updateWatch(user.userId, id, dto);
  }

  // A trip: what becomes of the people added for it (reserve by default).
  @Post(':id/end')
  end(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: EndWatchDto,
  ) {
    return this.watches.endWatch(user.userId, id, dto);
  }

  // "Nouveau cercle du voyage" / "Nouveau groupe de voyage".
  @Post(':id/circles')
  async createCircle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CreateTravelCircleDto,
  ) {
    await this.travel.createCircle(user.userId, id, dto);
    return this.watches.getWatch(user.userId, id);
  }

  // One of my Sentinels comes along (they keep their own circle).
  @Post(':id/travellers')
  async addTraveller(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AddTravellerDto,
  ) {
    await this.travel.addTraveller(user.userId, id, dto);
    return this.watches.getWatch(user.userId, id);
  }

  @Post(':id/travellers/:participantId/remove')
  async removeTraveller(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    await this.travel.removeTraveller(user.userId, id, participantId);
    return this.watches.getWatch(user.userId, id);
  }

  @Post(':id/steps')
  addStep(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: TripStepDto,
  ) {
    return this.watches.addStep(user.userId, id, dto);
  }

  @Patch(':id/steps/:stepId')
  updateStep(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateTripStepDto,
  ) {
    return this.watches.updateStep(user.userId, id, stepId, dto);
  }

  // "Je suis là" / "Je suis ailleurs" / "Tout va bien".
  @Post(':id/validate')
  validate(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ValidateWatchDto,
  ) {
    return this.watches.validate(user.userId, id, dto);
  }
}
