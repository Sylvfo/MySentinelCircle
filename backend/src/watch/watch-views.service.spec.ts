import { Test, TestingModule } from '@nestjs/testing';
import { AlertType, CircleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WatchViewsService } from './watch-views.service';

describe('WatchViewsService', () => {
  let service: WatchViewsService;
  let prisma: {
    alert: { findMany: jest.Mock };
    linkSentinels: { findMany: jest.Mock };
    alertParticipant: { findMany: jest.Mock };
  };

  const step = (overrides: Record<string, unknown> = {}) => ({
    id: 'cp-1',
    placeName: 'Refuge du Lac',
    expectedAt: new Date('2026-11-10T12:00:00Z'),
    alertAt: new Date('2026-11-10T14:00:00Z'),
    validatedAt: null,
    validatedPlace: null,
    validatedNote: 'Très fatiguée',
    validatedLatitude: 46.5,
    missedAt: null,
    openedAlertId: null,
    ...overrides,
  });
  const trip = (overrides: Record<string, unknown> = {}) => ({
    id: 'trip-1',
    userCompanionId: 'lea',
    label: 'Tour du lac',
    alertType: AlertType.TRAVEL,
    checkInSchedule: null,
    shareItineraryWithFirstCircle: false,
    shareValidationsWithFirstCircle: false,
    checkpoints: [
      step({ id: 'cp-0', validatedAt: new Date('2026-11-10T08:00:00Z') }),
      step(),
    ],
    ...overrides,
  });
  const myLink = (circleType: CircleType, tripId: string | null = null) => ({
    userCompanionId: 'lea',
    circle: { circleType, tripId },
  });

  beforeEach(async () => {
    prisma = {
      alert: { findMany: jest.fn() },
      linkSentinels: { findMany: jest.fn().mockResolvedValue([]) },
      alertParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // Watches first, then the alerts they opened (none).
    prisma.alert.findMany
      .mockResolvedValueOnce([trip()])
      .mockResolvedValueOnce([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchViewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(WatchViewsService);
  });

  it('shows a trip to someone in its travel circle: itinerary and validations', async () => {
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.BASIC, 'trip-1'),
    ]);

    const [view] = await service.viewsFor('bob', ['lea']);

    expect(view).toMatchObject({
      role: 'TRAVEL_CIRCLE',
      mode: 'TRIP',
      label: 'Tour du lac',
      currentPlace: 'Refuge du Lac',
    });
    expect(view.steps).toHaveLength(2);
    expect(view.steps[0].validatedAt).not.toBeNull();
    // Never the logbook nor positions.
    expect(JSON.stringify(view)).not.toContain('fatigu');
    expect(JSON.stringify(view)).not.toContain('46.5');
  });

  it('shows it to an existing Sentinel counted on the trip', async () => {
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.BASIC),
    ]);
    prisma.alertParticipant.findMany.mockResolvedValueOnce([
      { alertId: 'trip-1' },
    ]);

    const [view] = await service.viewsFor('bob', ['lea']);

    expect(view.role).toBe('TRAVEL_CIRCLE');
  });

  it('hides it from the 1st circle while nothing is shared', async () => {
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.FIRST),
    ]);

    await expect(service.viewsFor('bob', ['lea'])).resolves.toEqual([]);
  });

  it('shows the 1st circle only the validations when only those are shared', async () => {
    prisma.alert.findMany
      .mockReset()
      .mockResolvedValueOnce([trip({ shareValidationsWithFirstCircle: true })])
      .mockResolvedValueOnce([]);
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.FIRST),
    ]);

    const [view] = await service.viewsFor('bob', ['lea']);

    expect(view.role).toBe('FIRST_CIRCLE');
    expect(view.steps).toEqual([]);
    expect(view.currentPlace).toBeNull();
    expect(view.lastValidatedAt).toEqual(new Date('2026-11-10T08:00:00Z'));
  });

  it('never shows a watch to an outer circle', async () => {
    prisma.alert.findMany
      .mockReset()
      .mockResolvedValueOnce([
        trip({
          shareItineraryWithFirstCircle: true,
          shareValidationsWithFirstCircle: true,
        }),
      ])
      .mockResolvedValueOnce([]);
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.BASIC),
    ]);

    await expect(service.viewsFor('bob', ['lea'])).resolves.toEqual([]);
  });

  it('All Good: rhythm and next deadline with the first toggle', async () => {
    prisma.alert.findMany
      .mockReset()
      .mockResolvedValueOnce([
        trip({
          id: 'ag-1',
          label: 'Check tout va bien',
          alertType: AlertType.NOCONTACT,
          checkInSchedule: JSON.stringify({ kind: 'DAILY', before: '20:00' }),
          shareItineraryWithFirstCircle: true,
        }),
      ])
      .mockResolvedValueOnce([]);
    prisma.linkSentinels.findMany.mockResolvedValueOnce([
      myLink(CircleType.FIRST),
    ]);

    const [view] = await service.viewsFor('bob', ['lea']);

    expect(view).toMatchObject({
      mode: 'ALL_GOOD',
      schedule: { kind: 'DAILY', before: '20:00' },
      nextDeadline: new Date('2026-11-10T12:00:00Z'),
      lastValidatedAt: null,
      steps: [],
    });
  });
});
