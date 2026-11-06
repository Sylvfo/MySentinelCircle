import { NotificationType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import {
  AlertParticipantStatus,
  CircleType,
  LinkStatus,
  MessageType,
  UserStatus,
} from '@prisma/client';
import {
  AccountDeletionService,
  LEAD_ON_ALERT_IN_PROGRESS,
  OWN_ALERT_IN_PROGRESS,
} from './account-deletion.service';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { NotificationService } from '../notification/notification.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import { REALTIME_NOTIFIER } from '../realtime/realtime-notifier.interface';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    alert: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    message: { findMany: jest.Mock; updateMany: jest.Mock };
    alertParticipant: { findFirst: jest.Mock };
    circle: { findMany: jest.Mock; updateMany: jest.Mock };
    linkSentinels: {
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    notification: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let users: { assertStepUpFresh: jest.Mock };
  let sentinel: { leaveGroup: jest.Mock; deleteGroup: jest.Mock };
  let notifications: { create: jest.Mock };
  let sms: { send: jest.Mock };
  let realtime: { disconnectUser: jest.Mock };

  const account = {
    id: 'me',
    status: UserStatus.ACTIVE,
    avatarPath: null,
  };
  const leadLink = {
    id: 'link-1',
    circleId: 'circle-1',
    leadSlot: 'A',
    userCompanionId: 'marc',
    linkAsSentinel: { firstName: 'Lea', phone: '+41790000001' },
    userCompanion: { firstName: 'Marc', phone: '+41790000002' },
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      alertParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
      circle: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      linkSentinels: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
      notification: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    users = { assertStepUpFresh: jest.fn() };
    sentinel = { leaveGroup: jest.fn(), deleteGroup: jest.fn() };
    notifications = { create: jest.fn() };
    sms = { send: jest.fn() };
    realtime = { disconnectUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserService, useValue: users },
        { provide: SentinelService, useValue: sentinel },
        { provide: NotificationService, useValue: notifications },
        { provide: SMS_SENDER, useValue: sms },
        { provide: REALTIME_NOTIFIER, useValue: realtime },
      ],
    }).compile();

    service = module.get(AccountDeletionService);
  });

  it('requires a fresh step-up', async () => {
    users.assertStepUpFresh.mockImplementation(() => {
      throw new UnauthorizedException();
    });

    await expect(service.deleteAccount('me')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a deceased account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...account,
      status: UserStatus.DECEASED,
    });

    await expect(service.deleteAccount('me')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses while an alert concerns the person', async () => {
    prisma.alert.findFirst.mockResolvedValue({ id: 'alert' });

    await expect(service.deleteAccount('me')).rejects.toThrow(
      OWN_ALERT_IN_PROGRESS,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses while the person leads an active alert', async () => {
    prisma.alertParticipant.findFirst.mockResolvedValue({ id: 'participant' });

    await expect(service.deleteAccount('me')).rejects.toThrow(
      LEAD_ON_ALERT_IN_PROGRESS,
    );
    expect(prisma.alertParticipant.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isLead: true,
        // A Lead who already left the alert no longer blocks deletion.
        status: { not: AlertParticipantStatus.CLOSED },
        userSentinels: { userSentinelId: 'me' },
      }),
    });
  });

  it('wipes everything that identifies the person, keeping the row', async () => {
    await service.deleteAccount('me');

    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data).toMatchObject({
      status: UserStatus.DELETED,
      deletedAt: expect.any(Date),
      firstName: 'Compte supprimé',
      lastName: null,
      userName: null,
      email: null,
      phone: null,
      passwordHash: null,
      googleId: null,
      avatarPath: null,
      publicStatus: null,
      pendingPhone: null,
      pendingEmail: null,
      otpCodeHash: null,
      passwordResetTokenHash: null,
      deathAnnouncementMessage: null,
      gender: null,
    });
    expect(realtime.disconnectUser).toHaveBeenCalledWith('me');
  });

  it('replaces shared positions in their alerts, keeping the rest of the text', async () => {
    prisma.alert.findMany.mockResolvedValue([
      {
        id: 'a1',
        messageAlert:
          'Je rentre tard\n\nPosition partagée (± 20 m) : https://www.google.com/maps/search/?api=1&query=46.5,6.6',
      },
      { id: 'a2', messageAlert: 'Pas de position ici' },
    ]);

    await service.deleteAccount('me');

    expect(prisma.alert.findMany).toHaveBeenCalledWith({
      where: { userCompanionId: 'me' },
      select: { id: true, messageAlert: true },
    });
    expect(prisma.alert.update).toHaveBeenCalledTimes(1);
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { messageAlert: 'Je rentre tard\n\nPosition supprimée' },
    });
  });

  it('blanks their position messages and photos, and their death messages', async () => {
    await service.deleteAccount('me');

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        senderId: 'me',
        type: MessageType.TEXT,
        body: { startsWith: '📍 Position' },
      },
      data: { body: '📍 Position supprimée' },
    });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { senderId: 'me', type: MessageType.IMAGE },
      data: { type: MessageType.TEXT, body: '📷 Photo supprimée' },
    });
    expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
      where: { userCompanionId: 'me' },
      data: { deathPersonalMessage: null, notifyOnDeath: false },
    });
  });

  it('removes active links and leaves blocked ones alone', async () => {
    await service.deleteAccount('me');

    expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] },
        OR: [{ userSentinelId: 'me' }, { userCompanionId: 'me' }],
      },
      data: {
        status: LinkStatus.REMOVED,
        leadSlot: null,
        proposedCircleId: null,
      },
    });
  });

  it('leaves a joined group and deletes a founded one', async () => {
    prisma.circle.findMany.mockResolvedValue([
      { id: 'joined', circleType: CircleType.GROUP, groupRootId: 'root' },
      { id: 'founded', circleType: CircleType.GROUP, groupRootId: null },
    ]);

    await service.deleteAccount('me');

    expect(sentinel.leaveGroup).toHaveBeenCalledWith('me', 'root');
    expect(sentinel.deleteGroup).toHaveBeenCalledWith('me', 'founded');
  });

  it('warns a companion left with no Lead', async () => {
    prisma.linkSentinels.findMany
      .mockResolvedValueOnce([leadLink])
      .mockResolvedValueOnce([]);

    await service.deleteAccount('me');

    expect(sms.send).toHaveBeenCalledWith(
      '+41790000002',
      expect.stringContaining('Designez'),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'marc', accepted: false }),
    );
  });

  it('does not warn a companion who keeps another Lead', async () => {
    prisma.linkSentinels.findMany
      .mockResolvedValueOnce([leadLink])
      .mockResolvedValueOnce([]);
    prisma.linkSentinels.count.mockResolvedValue(1);

    await service.deleteAccount('me');

    expect(sms.send).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.SENTINEL_LEFT }),
    );
  });

  it('tells the Sentinels of the deleted person', async () => {
    prisma.linkSentinels.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([leadLink]);

    await service.deleteAccount('me');

    expect(sms.send).toHaveBeenCalledWith(
      '+41790000001',
      expect.stringContaining('Marc'),
    );
  });

  it('still succeeds when a notice fails', async () => {
    prisma.linkSentinels.findMany
      .mockResolvedValueOnce([leadLink])
      .mockResolvedValueOnce([]);
    sms.send.mockRejectedValue(new Error('provider down'));

    await expect(service.deleteAccount('me')).resolves.toEqual({
      message: 'Account deleted',
    });
  });
});
