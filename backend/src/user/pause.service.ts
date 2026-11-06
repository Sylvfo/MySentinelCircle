import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { UserService } from './user.service';
import { UpdatePauseDto } from './dto/update-pause.dto';
import { assertNotDeceased } from './user-status.util';

// The two independent pauses (plan.txt, PAUSE). Separate from
// UserService.updateProfile because "pause for others" has side effects on
// alerts in progress.
@Injectable()
export class PauseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertService,
    private readonly users: UserService,
  ) {}

  async updatePause(userId: string, dto: UpdatePauseDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, pausedForOthers: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    assertNotDeceased(user, 'This account');

    // Leave alerts first: it throws (a Lead on an alert in progress) before
    // anything is written.
    if (dto.pausedForOthers && !user.pausedForOthers) {
      await this.alerts.withdrawFromAlertsForPause(userId);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pausedForMe: dto.pausedForMe,
        pausedForOthers: dto.pausedForOthers,
      },
    });
    return this.users.getProfile(userId);
  }
}
