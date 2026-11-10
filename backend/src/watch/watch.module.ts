import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { WatchController } from './watch.controller';
import { WatchScheduler } from './watch.scheduler';
import { WatchService } from './watch.service';
import { TravelCircleService } from './travel-circles.service';
import { WatchViewsService } from './watch-views.service';

// Watch Mode (trip / All Good Check). Imports AlertModule: a missed
// deadline opens a real alert through AlertService.openAlert. Exported to
// SentinelModule: the OK SMS reply, and what companions see of a watch.
@Module({
  imports: [AlertModule],
  providers: [
    WatchService,
    WatchScheduler,
    TravelCircleService,
    WatchViewsService,
  ],
  controllers: [WatchController],
  exports: [WatchService, WatchViewsService, WatchScheduler],
})
export class WatchModule {}
