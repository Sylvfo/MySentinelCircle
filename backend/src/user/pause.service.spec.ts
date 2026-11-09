import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PauseService } from './pause.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { UserService } from './user.service';

describe('PauseService', () => {
  let service: PauseService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let alerts: { withdrawFromAlertsForPause: jest.Mock };
  let users: { getProfile: jest.Mock };

  const user = (overrides: Record<string, unknown> = {}) => ({
    status: UserStatus.ACTIVE,
    pausedForOthers: false,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    alerts = { withdrawFromAlertsForPause: jest.fn() };
    users = { getProfile: jest.fn().mockResolvedValue({ id: 'me' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PauseService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertService, useValue: alerts },
        { provide: UserService, useValue: users },
      ],
    }).compile();
    service = module.get(PauseService);
  });

  it('sets pause for me without touching alerts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(user());

    const result = await service.updatePause('me', { pausedForMe: true });

    expect(alerts.withdrawFromAlertsForPause).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { pausedForMe: true, pausedForOthers: undefined },
    });
    expect(result).toEqual({ id: 'me' });
  });

  it('leaves alerts in progress when pause for others is turned on', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(user());

    await service.updatePause('me', { pausedForOthers: true });

    expect(alerts.withdrawFromAlertsForPause).toHaveBeenCalledWith('me');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { pausedForMe: undefined, pausedForOthers: true },
    });
  });

  it('does not pause a Lead on an alert in progress', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(user());
    alerts.withdrawFromAlertsForPause.mockRejectedValueOnce(
      new ConflictException('lead'),
    );

    await expect(
      service.updatePause('me', { pausedForOthers: true }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not withdraw again when already paused for others', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      user({ pausedForOthers: true }),
    );

    await service.updatePause('me', { pausedForOthers: true });

    expect(alerts.withdrawFromAlertsForPause).not.toHaveBeenCalled();
  });

  it('lifts pause for others without touching alerts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      user({ pausedForOthers: true }),
    );

    await service.updatePause('me', { pausedForOthers: false });

    expect(alerts.withdrawFromAlertsForPause).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('refuses for a deceased account', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      user({ status: UserStatus.DECEASED }),
    );

    await expect(
      service.updatePause('me', { pausedForMe: true }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
