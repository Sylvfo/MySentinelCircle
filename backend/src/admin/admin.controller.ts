import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

// Under /user/ only because nginx already forwards that path to the
// backend: no extra nginx route for the admin page.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('user/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }
}
