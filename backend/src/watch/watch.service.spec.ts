import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AlertStatus,
  AlertType,
  CircleStatus,
  CircleType,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { WATCH_NEEDS_SUBSCRIPTION } from '../user/plan.util';
import { WatchService } from './watch.service';

const SUBSCRIBED = new Date('2999-01-01');
const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

// What a mocked create/update was called with.
interface Written {
  where: { id: string };
  data: Record<string, unknown> & {
    alertId: string;
    expectedAt: Date;
    alertAt: Date;
    checkInSchedule: string;
  };
}
const written = (mock: jest.Mock, call = 0) =>
  mock.mock.calls[call][0] as Written;

describe('WatchService', () => {
  let service: WatchService;
  let prisma: {
    alert: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    travelCheckpoint: { create: jest.Mock; update: jest.Mock };
    circle: { create: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    message: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let alerts: {
    loadFirstCircleForAlert: jest.Mock;
    assertAlertCanBeAnswered: jest.Mock;
    notifyAlertParticipants: jest.Mock;
  };

  const user = (overrides: Record<string, unknown> = {}) => ({
    status: UserStatus.ACTIVE,
    userType: UserType.ACCOUNT,
    phone: '+41790000000',
    phoneVerifiedAt: new Date(),
    paidUntil: SUBSCRIBED,
    timeZone: 'Europe/Zurich',
    ...overrides,
  });

  const step = (overrides: Record<string, unknown> = {}) => ({
    id: 'cp-1',
    placeName: 'Refuge du Lac',
    expectedAt: inHours(1),
    alertAt: inHours(3),
    remindedAt: null,
    validatedAt: null,
    missedAt: null,
    openedAlertId: null,
    ...overrides,
  });

  const trip = (overrides: Record<string, unknown> = {}) => ({
    id: 'trip-1',
    label: 'Tour du lac',
    messageAlert: 'Appeler le refuge',
    alertStatus: AlertStatus.SENT,
    alertType: AlertType.TRAVEL,
    userCompanionId: 'lea',
    firstCircleId: 'first-1',
    closedAt: null,
    pausedUntil: null,
    checkInSchedule: null,
    checkpoints: [step()],
    ...overrides,
  });

  const allGood = (overrides: Record<string, unknown> = {}) =>
    trip({
      id: 'ag-1',
      label: 'Check tout va bien',
      alertType: AlertType.NOCONTACT,
      checkInSchedule: JSON.stringify({ kind: 'DAILY', before: '20:00' }),
      ...overrides,
    });

  beforeEach(async () => {
    prisma = {
      alert: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'trip-1' }),
        update: jest.fn(),
      },
      travelCheckpoint: { create: jest.fn(), update: jest.fn() },
      circle: { create: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(user()) },
      message: { create: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    alerts = {
      loadFirstCircleForAlert: jest
        .fn()
        .mockResolvedValue({ circle: { id: 'first-1' }, links: [] }),
      assertAlertCanBeAnswered: jest.fn(),
      notifyAlertParticipants: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertService, useValue: alerts },
      ],
    }).compile();
    service = module.get(WatchService);
  });

  describe('createTrip', () => {
    const dto = () => ({
      name: ' Tour du lac ',
      instructions: 'Appeler le refuge',
      firstStep: {
        placeName: 'Refuge du Lac',
        expectedAt: inHours(2).toISOString(),
        delayMinutes: 120,
      },
    });

    it('creates the watched trip, its first step and its first travel circle', async () => {
      prisma.alert.findFirst
        .mockResolvedValueOnce(null) // no trip running
        .mockResolvedValueOnce(trip()); // the result

      await service.createTrip('lea', dto());

      expect(prisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          label: 'Tour du lac',
          messageAlert: 'Appeler le refuge',
          alertStatus: AlertStatus.SENT,
          alertType: AlertType.TRAVEL,
          userCompanionId: 'lea',
          firstCircleId: 'first-1',
          shareItineraryWithFirstCircle: false,
          shareValidationsWithFirstCircle: false,
        }),
      });
      const created = written(prisma.travelCheckpoint.create).data;
      expect(created.alertId).toBe('trip-1');
      expect(created.alertAt.getTime() - created.expectedAt.getTime()).toBe(
        2 * HOUR,
      );
      expect(prisma.circle.create).toHaveBeenCalledWith({
        data: {
          label: 'Cercle du voyage 1',
          circleType: CircleType.BASIC,
          userCompanionId: 'lea',
          tripId: 'trip-1',
        },
      });
      // Same rule as raising an alert about yourself.
      expect(alerts.loadFirstCircleForAlert).toHaveBeenCalledWith('lea');
      expect(alerts.assertAlertCanBeAnswered).toHaveBeenCalled();
    });

    it('needs a subscription', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ paidUntil: null }));

      await expect(service.createTrip('lea', dto())).rejects.toThrow(
        new ForbiddenException(WATCH_NEEDS_SUBSCRIPTION),
      );
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('refuses a deceased account and an unfinished profile', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        user({ status: UserStatus.DECEASED }),
      );
      await expect(service.createTrip('lea', dto())).rejects.toThrow(
        ForbiddenException,
      );
      prisma.user.findUnique.mockResolvedValueOnce(
        user({ userType: UserType.ONLY_SMS }),
      );
      await expect(service.createTrip('lea', dto())).rejects.toThrow(
        'Complete your profile first',
      );
    });

    it('allows one running trip at a time', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(trip());

      await expect(service.createTrip('lea', dto())).rejects.toThrow(
        new ConflictException('A trip is already running'),
      );
    });

    it('refuses when the 1st circle could not drive an alert', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      alerts.loadFirstCircleForAlert.mockRejectedValue(
        new ConflictException('no Lead'),
      );

      await expect(service.createTrip('lea', dto())).rejects.toThrow('no Lead');
      expect(prisma.alert.create).not.toHaveBeenCalled();
    });

    it('refuses a first step in the past', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      const past = dto();
      past.firstStep.expectedAt = inHours(-1).toISOString();

      await expect(service.createTrip('lea', past)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('startAllGood', () => {
    it('stores the rhythm and plans the first deadline from it', async () => {
      prisma.alert.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(allGood());
      prisma.alert.create.mockResolvedValue({ id: 'ag-1' });

      await service.startAllGood('lea', {
        schedule: { kind: 'WEEKDAYS', days: [5, 1, 1], before: '20:00' },
        delayMinutes: 60,
      });

      const data = written(prisma.alert.create).data;
      expect(data).toMatchObject({
        label: 'Check tout va bien',
        alertType: AlertType.NOCONTACT,
        alertStatus: AlertStatus.SENT,
      });
      expect(JSON.parse(data.checkInSchedule)).toEqual({
        kind: 'WEEKDAYS',
        days: [1, 5],
        before: '20:00',
      });
      const first = written(prisma.travelCheckpoint.create).data;
      expect(first.expectedAt.getTime()).toBeGreaterThan(Date.now());
      expect(first.alertAt.getTime() - first.expectedAt.getTime()).toBe(HOUR);
    });

    it('allows one All Good Check at a time', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(allGood());

      await expect(
        service.startAllGood('lea', {
          schedule: { kind: 'DAILY', before: '20:00' },
          delayMinutes: 60,
        }),
      ).rejects.toThrow('The All Good Check is already on');
    });
  });

  describe('validate', () => {
    it('validates the current step as planned, the next one being already planned', async () => {
      prisma.alert.findFirst.mockResolvedValue(
        trip({
          checkpoints: [step(), step({ id: 'cp-2', expectedAt: inHours(5) })],
        }),
      );

      await service.validate('lea', 'trip-1', {
        kind: 'AS_PLANNED',
        latitude: 46.5,
        longitude: 6.6,
        note: ' Belle vue ',
      });

      expect(prisma.travelCheckpoint.update).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
        data: {
          validatedAt: expect.any(Date),
          validatedLatitude: 46.5,
          validatedLongitude: 6.6,
          validatedPlace: null,
          validatedNote: 'Belle vue',
        },
      });
      expect(prisma.travelCheckpoint.create).not.toHaveBeenCalled();
    });

    it('needs the next step, or the end of the trip, after the last one', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await expect(
        service.validate('lea', 'trip-1', { kind: 'AS_PLANNED' }),
      ).rejects.toThrow('Plan the next step, or say this was the last one');
      expect(prisma.travelCheckpoint.update).not.toHaveBeenCalled();
    });

    it('plans the next step given with the validation', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await service.validate('lea', 'trip-1', {
        kind: 'AS_PLANNED',
        nextStep: {
          placeName: 'Col',
          expectedAt: inHours(6).toISOString(),
          delayMinutes: 30,
        },
      });

      expect(prisma.travelCheckpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ placeName: 'Col', alertId: 'trip-1' }),
      });
    });

    it('ends the trip on its last step', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await service.validate('lea', 'trip-1', { endTrip: true });

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: { closedAt: expect.any(Date), closedById: 'lea' },
      });
    });

    it('needs the place when somewhere else', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await expect(
        service.validate('lea', 'trip-1', { kind: 'ELSEWHERE', endTrip: true }),
      ).rejects.toThrow('Say where you are');
    });

    it('records where they are instead', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await service.validate('lea', 'trip-1', {
        kind: 'ELSEWHERE',
        place: ' Gîte du Col ',
        endTrip: true,
      });

      expect(written(prisma.travelCheckpoint.update).data.validatedPlace).toBe(
        'Gîte du Col',
      );
    });

    it('All Good: validates and plans the next deadline after this one', async () => {
      const current = step({
        expectedAt: inHours(2),
        alertAt: inHours(3),
        placeName: null,
      });
      prisma.alert.findFirst.mockResolvedValue(
        allGood({ checkpoints: [current] }),
      );

      await service.validate('lea', 'ag-1', {});

      const next = written(prisma.travelCheckpoint.create).data;
      expect(next.alertId).toBe('ag-1');
      expect(next.expectedAt.getTime()).toBeGreaterThan(
        current.expectedAt.getTime(),
      );
      expect(next.alertAt.getTime() - next.expectedAt.getTime()).toBe(HOUR);
    });

    it('answers a missed deadline whose alert runs, and says so in its room', async () => {
      prisma.alert.findFirst.mockResolvedValue(
        trip({
          checkpoints: [
            step({ id: 'missed', missedAt: new Date(), openedAlertId: 'al-1' }),
            step({ id: 'cp-2', expectedAt: inHours(5) }),
          ],
        }),
      );
      prisma.alert.findMany.mockResolvedValue([
        { id: 'al-1', conversations: [{ id: 'room-1', closedAt: null }] },
      ]);

      await service.validate('lea', 'trip-1', {});

      expect(written(prisma.travelCheckpoint.update).where).toEqual({
        id: 'missed',
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: 'room-1',
          senderId: 'lea',
          body: expect.stringContaining('Refuge du Lac'),
        }),
      });
      expect(alerts.notifyAlertParticipants).toHaveBeenCalledWith('al-1');
    });

    it('has nothing to validate once every step is done', async () => {
      prisma.alert.findFirst.mockResolvedValue(
        trip({ checkpoints: [step({ validatedAt: new Date() })] }),
      );

      await expect(service.validate('lea', 'trip-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('is only for the person themself, and only while it runs', async () => {
      prisma.alert.findFirst.mockResolvedValueOnce(null);
      await expect(service.validate('bob', 'trip-1', {})).rejects.toThrow(
        NotFoundException,
      );
      prisma.alert.findFirst.mockResolvedValueOnce(
        trip({ closedAt: new Date() }),
      );
      await expect(service.validate('lea', 'trip-1', {})).rejects.toThrow(
        'This watch is over',
      );
    });
  });

  describe('updateWatch', () => {
    it('keeps the All Good settings for the All Good Check', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await expect(
        service.updateWatch('lea', 'trip-1', { delayMinutes: 60 }),
      ).rejects.toThrow('Only for the All Good Check');
    });

    it('moves the next deadline to the new rhythm', async () => {
      const pending = step({ placeName: null, remindedAt: new Date() });
      prisma.alert.findFirst.mockResolvedValue(
        allGood({ checkpoints: [pending] }),
      );

      await service.updateWatch('lea', 'ag-1', {
        schedule: { kind: 'DAILY', before: '06:00' },
        delayMinutes: 30,
      });

      const moved = written(prisma.travelCheckpoint.update);
      expect(moved.where).toEqual({ id: 'cp-1' });
      expect(moved.data.remindedAt).toBeNull();
      expect(
        moved.data.alertAt.getTime() - moved.data.expectedAt.getTime(),
      ).toBe(HOUR / 2);
    });

    it('pauses until a future date, and resumes with null', async () => {
      prisma.alert.findFirst.mockResolvedValue(allGood());

      await expect(
        service.updateWatch('lea', 'ag-1', {
          pausedUntil: inHours(-1).toISOString(),
        }),
      ).rejects.toThrow('A pause ends in the future');

      await service.updateWatch('lea', 'ag-1', { pausedUntil: null });
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'ag-1' },
        data: { pausedUntil: null },
      });
    });
  });

  describe('updateStep', () => {
    it('moves a planned step and asks again at the new time', async () => {
      prisma.alert.findFirst.mockResolvedValue(
        trip({ checkpoints: [step({ remindedAt: new Date() })] }),
      );
      const at = inHours(4);

      await service.updateStep('lea', 'trip-1', 'cp-1', {
        expectedAt: at.toISOString(),
      });

      expect(prisma.travelCheckpoint.update).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
        data: {
          expectedAt: at,
          alertAt: new Date(at.getTime() + 2 * HOUR),
          remindedAt: null,
        },
      });
    });

    it('leaves a validated step as it was', async () => {
      prisma.alert.findFirst.mockResolvedValue(
        trip({ checkpoints: [step({ validatedAt: new Date() })] }),
      );

      await expect(
        service.updateStep('lea', 'trip-1', 'cp-1', { placeName: 'X' }),
      ).rejects.toThrow('This step is already validated');
    });
  });

  describe('endWatch', () => {
    it('ends the watch and closes the travel circles nobody joined', async () => {
      prisma.alert.findFirst.mockResolvedValue(trip());

      await service.endWatch('lea', 'trip-1');

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: { closedAt: expect.any(Date), closedById: 'lea' },
      });
      expect(prisma.circle.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tripId: 'trip-1',
          status: CircleStatus.ACTIVE,
        }),
        data: { status: CircleStatus.CLOSED, closedAt: expect.any(Date) },
      });
    });
  });

  describe('getWatch', () => {
    it('says why a watch is paused', async () => {
      prisma.alert.findFirst.mockResolvedValue(allGood());
      prisma.user.findUnique.mockResolvedValue(user({ paidUntil: null }));

      const watch = await service.getWatch('lea', 'ag-1');

      expect(watch.mode).toBe('ALL_GOOD');
      expect(watch.pausedBecause).toBe('SUBSCRIPTION');
      expect(watch.schedule).toEqual({ kind: 'DAILY', before: '20:00' });
      expect(watch.currentCheckpointId).toBe('cp-1');
    });
  });
});
