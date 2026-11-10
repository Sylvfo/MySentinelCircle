import { Test, TestingModule } from '@nestjs/testing';
import { AlertType, NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { NotificationService } from '../notification/notification.service';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import { WatchScheduler } from './watch.scheduler';
import { WatchService } from './watch.service';

const SUBSCRIBED = new Date('2999-01-01');
const MIN = 60_000;
const DAY = 86_400_000;
// 10.11.2026 14:00 in Zurich.
const NOW = new Date('2026-11-10T13:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MIN);

describe('WatchScheduler', () => {
  let scheduler: WatchScheduler;
  let prisma: {
    alert: { updateMany: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    travelCheckpoint: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    message: { create: jest.Mock };
    linkSentinels: { findMany: jest.Mock };
    notification: { count: jest.Mock };
  };
  let alerts: {
    loadFirstCircleForAlert: jest.Mock;
    openAlert: jest.Mock;
    notifyParticipants: jest.Mock;
    notifyAlertParticipants: jest.Mock;
  };
  let watches: { nextAllGoodCheckpoint: jest.Mock };
  let notifications: { create: jest.Mock };
  let sms: { send: jest.Mock };
  let notifier: { notifyAlertChanged: jest.Mock };

  const owner = (overrides: Record<string, unknown> = {}) => ({
    id: 'lea',
    firstName: 'Léa',
    lastName: 'Martin',
    phone: '+41790000000',
    language: 'fr',
    gender: null,
    timeZone: 'Europe/Zurich',
    paidUntil: SUBSCRIBED,
    ...overrides,
  });

  const watch = (overrides: Record<string, unknown> = {}) => ({
    id: 'trip-1',
    label: 'Tour du lac',
    messageAlert: 'Appeler le refuge',
    alertType: AlertType.TRAVEL,
    pausedUntil: null,
    checkInSchedule: null,
    userCompanionId: 'lea',
    firstCircleId: 'first-1',
    userCompanion: owner(),
    ...overrides,
  });

  const checkpoint = (overrides: Record<string, unknown> = {}) => ({
    id: 'cp-1',
    alertId: 'trip-1',
    placeName: 'Refuge du Lac',
    // Planned at 14:00, alert at 16:00.
    expectedAt: NOW,
    alertAt: new Date(NOW.getTime() + 120 * MIN),
    remindedAt: null,
    validatedAt: null,
    missedAt: null,
    openedAlertId: null,
    ...overrides,
  });

  const links = [{ id: 'link-1', linkAsSentinel: { phone: '+41791111111' } }];

  beforeEach(async () => {
    prisma = {
      alert: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([watch()]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      travelCheckpoint: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn(),
      },
      message: { create: jest.fn() },
      linkSentinels: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { count: jest.fn().mockResolvedValue(0) },
    };
    alerts = {
      loadFirstCircleForAlert: jest
        .fn()
        .mockResolvedValue({ circle: { id: 'first-1', label: '1er' }, links }),
      openAlert: jest.fn().mockResolvedValue({ id: 'al-1' }),
      notifyParticipants: jest.fn(),
      notifyAlertParticipants: jest.fn(),
    };
    watches = {
      nextAllGoodCheckpoint: jest.fn().mockResolvedValue({
        alertId: 'ag-1',
        expectedAt: new Date(NOW.getTime() + DAY),
        alertAt: new Date(NOW.getTime() + DAY + 60 * MIN),
      }),
    };
    notifications = { create: jest.fn() };
    sms = { send: jest.fn() };
    notifier = { notifyAlertChanged: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertService, useValue: alerts },
        { provide: WatchService, useValue: watches },
        { provide: NotificationService, useValue: notifications },
        { provide: SMS_SENDER, useValue: sms },
        { provide: REALTIME_NOTIFIER, useValue: notifier },
      ],
    }).compile();
    scheduler = module.get(WatchScheduler);
  });

  // The checkpoints due at NOW (the query filters by expectedAt).
  const due = (...rows: ReturnType<typeof checkpoint>[]) =>
    prisma.travelCheckpoint.findMany.mockResolvedValueOnce(rows);

  it('ends the watches of a person whose death is confirmed', async () => {
    await scheduler.runDeadlines(NOW);

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userCompanion: { status: UserStatus.DECEASED },
      }),
      data: { closedAt: NOW },
    });
  });

  it('reminds the traveller at the time of a step', async () => {
    due(checkpoint());

    await scheduler.runDeadlines(NOW);

    expect(prisma.travelCheckpoint.updateMany).toHaveBeenCalledWith({
      where: { id: 'cp-1', remindedAt: null },
      data: { remindedAt: NOW },
    });
    const text = sms.send.mock.calls[0][1] as string;
    expect(sms.send.mock.calls[0][0]).toBe('+41790000000');
    expect(text).toContain('arrive.e a l\'etape "Refuge du Lac"');
    expect(text).toContain('(prevue a 14:00)');
    expect(text).toContain('Sans reponse a 16:00');
    expect(notifications.create).toHaveBeenCalledWith({
      userId: 'lea',
      type: NotificationType.WATCH_CHECK_DUE,
      targetId: 'trip-1',
    });
    expect(alerts.openAlert).not.toHaveBeenCalled();
  });

  it('never reminds twice (another tick claimed it)', async () => {
    due(checkpoint());
    prisma.travelCheckpoint.updateMany.mockResolvedValueOnce({ count: 0 });

    await scheduler.runDeadlines(NOW);

    expect(sms.send).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('opens an alert for the 1st circle at the alert time', async () => {
    due(
      checkpoint({
        expectedAt: ago(120),
        alertAt: NOW,
        remindedAt: ago(120),
      }),
    );

    await scheduler.runDeadlines(NOW);

    expect(prisma.travelCheckpoint.updateMany).toHaveBeenCalledWith({
      where: { id: 'cp-1', missedAt: null, validatedAt: null },
      data: { missedAt: NOW },
    });
    expect(alerts.loadFirstCircleForAlert).toHaveBeenCalledWith('lea', {
      requireLead: false,
    });
    const opened = alerts.openAlert.mock.calls[0][0];
    expect(opened).toMatchObject({
      companionId: 'lea',
      alertType: AlertType.TRAVEL,
      launchedById: null,
      paidById: null,
      tripId: 'trip-1',
    });
    expect(opened.messageAlert).toBe(
      'Étape « Refuge du Lac » du voyage « Tour du lac », prévue à 12:00, ' +
        'non validée.\n\nQue faire : Appeler le refuge',
    );
    expect(prisma.travelCheckpoint.update).toHaveBeenCalledWith({
      where: { id: 'cp-1' },
      data: { openedAlertId: 'al-1' },
    });
    // The 1st circle by SMS (with the instructions), the person too.
    const toCircle = alerts.notifyParticipants.mock.calls[0][2] as (
      lang: 'fr' | 'en',
    ) => string;
    expect(toCircle('fr')).toContain('Que faire : Appeler le refuge');
    expect(sms.send).toHaveBeenCalledWith(
      '+41790000000',
      expect.stringContaining('votre 1er cercle a ete prevenu'),
    );
    expect(alerts.notifyAlertParticipants).toHaveBeenCalledWith('al-1', {
      type: NotificationType.ALERT_RAISED,
    });
  });

  it('leaves a full delay after a late reminder', async () => {
    // The alert time has passed, but the reminder only went out 30 min ago.
    due(
      checkpoint({
        expectedAt: ago(180),
        alertAt: ago(60),
        remindedAt: ago(30),
      }),
    );

    await scheduler.runDeadlines(NOW);

    expect(prisma.travelCheckpoint.updateMany).not.toHaveBeenCalled();
    expect(alerts.openAlert).not.toHaveBeenCalled();
  });

  it('posts in the room of an alert already running instead of opening one', async () => {
    due(
      checkpoint({ expectedAt: ago(120), alertAt: NOW, remindedAt: ago(120) }),
    );
    prisma.alert.findFirst.mockResolvedValueOnce({
      id: 'other',
      conversations: [{ id: 'room-1', closedAt: null }],
    });

    await scheduler.runDeadlines(NOW);

    expect(alerts.openAlert).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'room-1',
        senderId: 'lea',
        body: expect.stringContaining('⏰ Étape « Refuge du Lac »'),
      }),
    });
    expect(alerts.notifyAlertParticipants).toHaveBeenCalledWith('other');
  });

  it('marks the deadline missed even when nobody can be told', async () => {
    due(
      checkpoint({ expectedAt: ago(120), alertAt: NOW, remindedAt: ago(120) }),
    );
    alerts.loadFirstCircleForAlert.mockRejectedValueOnce(new Error('nobody'));

    await scheduler.runDeadlines(NOW);

    expect(prisma.travelCheckpoint.updateMany).toHaveBeenCalled();
    expect(alerts.openAlert).not.toHaveBeenCalled();
  });

  it('does nothing while the subscription has ended', async () => {
    prisma.alert.findMany.mockResolvedValueOnce([
      watch({ userCompanion: owner({ paidUntil: ago(10) }) }),
    ]);
    due(checkpoint());

    await scheduler.runDeadlines(NOW);

    expect(sms.send).not.toHaveBeenCalled();
    expect(prisma.travelCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  describe('All Good Check', () => {
    const agWatch = (overrides: Record<string, unknown> = {}) =>
      watch({
        id: 'ag-1',
        label: 'Check tout va bien',
        alertType: AlertType.NOCONTACT,
        checkInSchedule: JSON.stringify({ kind: 'DAILY', before: '14:00' }),
        ...overrides,
      });
    const agCheckpoint = (overrides: Record<string, unknown> = {}) =>
      checkpoint({
        id: 'ag-cp',
        alertId: 'ag-1',
        placeName: null,
        ...overrides,
      });

    it('skips a deadline while it rests during a trip', async () => {
      prisma.alert.findMany.mockResolvedValueOnce([agWatch(), watch()]);
      due(agCheckpoint());

      await scheduler.runDeadlines(NOW);

      expect(sms.send).not.toHaveBeenCalled();
      expect(prisma.travelCheckpoint.updateMany).toHaveBeenCalledWith({
        where: { id: 'ag-cp', validatedAt: null, missedAt: null },
        data: {
          expectedAt: new Date(NOW.getTime() + DAY),
          alertAt: new Date(NOW.getTime() + DAY + 60 * MIN),
          remindedAt: null,
        },
      });
    });

    it('skips a deadline while paused by the person', async () => {
      prisma.alert.findMany.mockResolvedValueOnce([
        agWatch({ pausedUntil: new Date(NOW.getTime() + DAY) }),
      ]);
      due(agCheckpoint());

      await scheduler.runDeadlines(NOW);

      expect(sms.send).not.toHaveBeenCalled();
      expect(watches.nextAllGoodCheckpoint).toHaveBeenCalled();
    });

    it('reminds with the All Good text', async () => {
      prisma.alert.findMany.mockResolvedValueOnce([agWatch()]);
      due(agCheckpoint());

      await scheduler.runDeadlines(NOW);

      expect(sms.send.mock.calls[0][1]).toContain('tout va bien ?');
    });

    it('after a miss, opens a NOCONTACT alert and plans the next deadline', async () => {
      prisma.alert.findMany.mockResolvedValueOnce([agWatch()]);
      due(
        agCheckpoint({
          expectedAt: ago(60),
          alertAt: NOW,
          remindedAt: ago(60),
        }),
      );
      // No deadline left ahead once this one is missed.
      prisma.travelCheckpoint.findMany.mockResolvedValueOnce([]);

      await scheduler.runDeadlines(NOW);

      expect(alerts.openAlert.mock.calls[0][0]).toMatchObject({
        alertType: AlertType.NOCONTACT,
        tripId: 'ag-1',
        messageAlert: expect.stringContaining(
          'Check tout va bien prévu à 13:00',
        ),
      });
      expect(prisma.travelCheckpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ alertId: 'ag-1' }),
      });
    });
  });

  describe('runSubscriptionReminders', () => {
    const ending = (daysLeft: number) => [
      {
        id: 'trip-1',
        firstCircleId: 'first-1',
        userCompanionId: 'lea',
        userCompanion: {
          paidUntil: new Date(NOW.getTime() + daysLeft * DAY),
        },
      },
    ];

    it('tells the person 30 days before, once', async () => {
      prisma.alert.findMany.mockResolvedValueOnce(ending(29));

      await scheduler.runSubscriptionReminders(NOW);

      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'lea',
        type: NotificationType.WATCH_PAUSE_SOON,
        targetId: 'trip-1',
      });
      expect(prisma.linkSentinels.findMany).not.toHaveBeenCalled();

      notifications.create.mockClear();
      prisma.alert.findMany.mockResolvedValueOnce(ending(29));
      prisma.notification.count.mockResolvedValueOnce(1);
      await scheduler.runSubscriptionReminders(NOW);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('tells the 1st circle too, 7 days before', async () => {
      prisma.alert.findMany.mockResolvedValueOnce(ending(6));
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { userSentinelId: 'bob' },
      ]);

      await scheduler.runSubscriptionReminders(NOW);

      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'bob',
        type: NotificationType.WATCH_PAUSE_SOON,
        actorUserId: 'lea',
        targetId: 'lea',
      });
      // Counted since the 7-day mark, not the 30-day one.
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'lea',
          createdAt: { gte: new Date(NOW.getTime() - DAY) },
        }),
      });
    });
  });
});
