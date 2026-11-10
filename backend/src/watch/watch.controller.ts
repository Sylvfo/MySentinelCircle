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
import {
  CreateTripDto,
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
  constructor(private readonly watches: WatchService) {}

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.watches.listMine(user.userId);
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

  @Post(':id/end')
  end(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.watches.endWatch(user.userId, id);
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
