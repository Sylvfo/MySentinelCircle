import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
