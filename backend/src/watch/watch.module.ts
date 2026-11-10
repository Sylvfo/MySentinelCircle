import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { WatchController } from './watch.controller';
import { WatchScheduler } from './watch.scheduler';
import { WatchService } from './watch.service';

// Watch Mode (trip / All Good Check). Imports AlertModule: a missed
// deadline opens a real alert through AlertService.openAlert.
@Module({
  imports: [AlertModule],
  providers: [WatchService, WatchScheduler],
  controllers: [WatchController],
  exports: [WatchService],
})
export class WatchModule {}
