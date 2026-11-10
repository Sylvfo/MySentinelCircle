import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CircleStatus,
  CircleType,
  LeadSlot,
  LinkInitiator,
  LinkStatus,
  NotificationType,
  SentinelType,
  UserStatus,
  UserType,
} from '@prisma/client';
import { SentinelService } from './sentinel.service';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import { NotificationService } from '../notification/notification.service';
import { GroupService } from './group.service';
import { DeathNoticeService } from './death-notice.service';

describe('SentinelService', () => {
  let service: SentinelService;
  let groups: GroupService;
  let deathNotice: DeathNoticeService;
  let prisma: {
    circle: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    linkSentinels: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    sentinelGroupInvitation: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    alertParticipant: { count: jest.Mock };
    alert: { groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let sms: { send: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      circle: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      linkSentinels: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sentinelGroupInvitation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      alertParticipant: { count: jest.fn() },
      alert: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    sms = { send: jest.fn() };
    notifications = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentinelService,
        GroupService,
        DeathNoticeService,
        { provide: PrismaService, useValue: prisma },
        { provide: SMS_SENDER, useValue: sms },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get<SentinelService>(SentinelService);
    groups = module.get<GroupService>(GroupService);
    deathNotice = module.get<DeathNoticeService>(DeathNoticeService);
  });

  describe('listCircles', () => {
    it('tells whether each Sentinel is subscribed, without the end date', async () => {
      prisma.circle.findFirst
        .mockResolvedValueOnce({ id: 'first-1' })
        .mockResolvedValueOnce({ id: 'reserve-1' });
      prisma.circle.findMany.mockResolvedValueOnce([
        {
          id: 'first-1',
          circleType: CircleType.FIRST,
          userSentinels: [
            {
              id: 'l1',
              linkAsSentinel: { id: 'a', paidUntil: new Date('2999-01-01') },
            },
            { id: 'l2', linkAsSentinel: { id: 'b', paidUntil: null } },
          ],
        },
      ]);

      const [first] = await service.listCircles('me');

      expect(first.userSentinels.map((m) => m.linkAsSentinel)).toEqual([
        { id: 'a', subscribed: true },
        { id: 'b', subscribed: false },
      ]);
    });

    it('creates the 1st and reserve circles if missing, sorted FIRST -> BASIC -> RESERVED', async () => {
      prisma.circle.findFirst
        .mockResolvedValueOnce(null) // ensurePrimaryCircle: none yet
        .mockResolvedValueOnce(null); // ensureReserveCircle: none yet
      prisma.circle.create
        .mockResolvedValueOnce({ id: 'first-1', circleType: CircleType.FIRST })
        .mockResolvedValueOnce({
          id: 'reserve-1',
          circleType: CircleType.RESERVED,
        });
      prisma.circle.findMany.mockResolvedValueOnce([
        { id: 'reserve-1', circleType: CircleType.RESERVED, userSentinels: [] },
        { id: 'basic-1', circleType: CircleType.BASIC, userSentinels: [] },
        { id: 'first-1', circleType: CircleType.FIRST, userSentinels: [] },
      ]);

      const result = await service.listCircles('me');

      expect(prisma.circle.create).toHaveBeenCalledTimes(2);
      // A deleted (CLOSED) circle never shows up again.
      expect(prisma.circle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userCompanionId: 'me', status: CircleStatus.ACTIVE },
        }),
      );
      expect(result.map((c) => c.id)).toEqual([
        'first-1',
        'basic-1',
        'reserve-1',
      ]);
    });
  });

  describe('inviteSentinel', () => {
    it('refuses an SMS-only person in the 1st circle, Lead or not', async () => {
      for (const requestedAsLead of [false, true]) {
        prisma.user.findUnique
          .mockResolvedValueOnce({ id: 'me', userType: UserType.ACCOUNT }) // getUser(inviter)
          .mockResolvedValueOnce({ id: 'stub', userType: UserType.ONLY_SMS }); // target by phone
        prisma.circle.findUnique.mockResolvedValueOnce({
          id: 'first-1',
          userCompanionId: 'me',
          circleType: CircleType.FIRST,
          status: CircleStatus.ACTIVE,
        });

        await expect(
          service.inviteSentinel('me', 'first-1', {
            phone: '+33612345678',
            name: 'Ada',
            requestedAsLead,
          } as any),
        ).rejects.toThrow('A 1st-circle Sentinel must already have an account');
      }
    });

    it('rejects inviting directly into the reserve circle', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        userType: UserType.ACCOUNT,
      }); // getUser(inviter)
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
      });

      await expect(
        service.inviteSentinel('me', 'reserve-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects inviting into a closed circle', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        userType: UserType.ACCOUNT,
      }); // getUser(inviter)
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'basic-1',
        userCompanionId: 'me',
        circleType: CircleType.BASIC,
        status: CircleStatus.CLOSED,
      });

      await expect(
        service.inviteSentinel('me', 'basic-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('still requires an existing account for a 1st-circle Sentinel', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'me', userType: UserType.ACCOUNT }) // getUser(inviter)
        .mockResolvedValueOnce(null); // no account for that phone
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
      });

      await expect(
        service.inviteSentinel('me', 'first-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an UNCOMPLETE caller (no phone yet)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        userType: UserType.UNCOMPLETE,
      }); // getUser(inviter), fetched before the circle check

      await expect(
        service.inviteSentinel('me', 'first-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.circle.findUnique).not.toHaveBeenCalled();
    });

    it('rejects re-inviting someone whose link is BLOCKED', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
      });
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'me', userType: UserType.ACCOUNT }) // getUser(inviter)
        .mockResolvedValueOnce({ id: 'sentinel-1' }) // linkedUser lookup
        .mockResolvedValueOnce({ id: 'sentinel-1' }); // findOrCreateUserByPhone
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.BLOCKED,
      });

      await expect(
        service.inviteSentinel('me', 'first-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow('This person cannot be linked again');
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
      expect(prisma.linkSentinels.create).not.toHaveBeenCalled();
    });

    it('bootstraps the first Sentinel of an empty 1st circle as LEAD_1', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
      });
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'me',
          userType: UserType.ACCOUNT,
          firstName: 'Me',
        }) // getUser(inviter)
        .mockResolvedValueOnce({ id: 'sentinel-1' }) // linkedUser lookup (has account)
        .mockResolvedValueOnce({ id: 'sentinel-1' }); // findOrCreateUserByPhone lookup
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(null); // no existing link
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]); // no active leads yet
      prisma.linkSentinels.create.mockResolvedValueOnce({ id: 'link-1' });

      await service.inviteSentinel('me', 'first-1', {
        phone: '+33612345678',
        name: 'Ada',
      });

      expect(prisma.linkSentinels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leadSlot: LeadSlot.LEAD_1 }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-1',
        type: NotificationType.SENTINEL_INVITATION_RECEIVED,
        actorUserId: 'me',
        actorLabel: 'Me',
        targetId: 'link-1',
      });
    });

    it('rejects when the inviter’s own account is deceased', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        userType: UserType.ACCOUNT,
        status: 'DECEASED',
      }); // getUser(inviter)

      await expect(
        service.inviteSentinel('me', 'first-1', {
          phone: '+33612345678',
          name: 'Ada',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.circle.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('requestToBeSentinel', () => {
    it('treats an SMS-only target like an unknown number', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'stub',
        userType: UserType.ONLY_SMS,
      });

      await expect(
        service.requestToBeSentinel('me', {
          targetPhone: '+33612345678',
        } as any),
      ).rejects.toThrow('No account with this phone number');
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an UNCOMPLETE requester (no phone yet)', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'target-1' }) // target lookup by phone
        .mockResolvedValueOnce({ id: 'me', userType: UserType.UNCOMPLETE }); // getUser(requester)

      await expect(
        service.requestToBeSentinel('me', {
          targetPhone: '+33612345678',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
    });

    it('notifies the target companion of the incoming request', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'target-1', phone: '+33612345678' }) // target lookup by phone
        .mockResolvedValueOnce({
          id: 'requester-1',
          userType: UserType.ACCOUNT,
          firstName: 'Dana',
        }); // getUser(requester)
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'first-1',
        circleType: CircleType.FIRST,
      }); // ensurePrimaryCircle
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(null); // no existing link
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]); // resolveLeadSlot's lead check
      prisma.linkSentinels.create.mockResolvedValueOnce({ id: 'link-1' });

      await service.requestToBeSentinel('requester-1', {
        targetPhone: '+33612345678',
      });

      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'target-1',
        type: NotificationType.SENTINEL_REQUEST_RECEIVED,
        actorUserId: 'requester-1',
        actorLabel: 'Dana',
        targetId: 'link-1',
      });
    });

    it('rejects when the target companion is deceased', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'target-1',
        phone: '+33612345678',
        status: 'DECEASED',
      }); // target lookup by phone

      await expect(
        service.requestToBeSentinel('me', {
          targetPhone: '+33612345678',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('respondToMembership', () => {
    const pendingSentinelRequest = {
      id: 'link-1',
      status: LinkStatus.PENDING,
      initiatedBy: LinkInitiator.SENTINEL,
      userSentinelId: 'sentinel-1',
      userCompanionId: 'companion-1',
      circleId: 'first-1',
      leadSlot: null,
      circle: { id: 'first-1', circleType: CircleType.FIRST },
      linkAsSentinel: { phone: '+33611111111', firstName: 'Sentinel' },
      userCompanion: { phone: '+33622222222', firstName: 'Companion' },
    };

    it('requires a circle to accept a Sentinel-initiated request', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(
        pendingSentinelRequest,
      );

      await expect(
        service.respondToMembership('companion-1', 'link-1', true),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('rejects responding when the companion is deceased', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        ...pendingSentinelRequest,
        userCompanion: {
          ...pendingSentinelRequest.userCompanion,
          status: 'DECEASED',
        },
      });

      await expect(
        service.respondToMembership('companion-1', 'link-1', true),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('moves the link into the chosen circle on accept', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(
        pendingSentinelRequest,
      );
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'work-1',
        userCompanionId: 'companion-1',
        circleType: CircleType.BASIC,
        status: CircleStatus.ACTIVE,
      });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.respondToMembership(
        'companion-1',
        'link-1',
        true,
        'work-1',
      );

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LinkStatus.ACCEPTED,
            circleId: 'work-1',
            leadSlot: null,
          }),
        }),
      );
      // Sentinel-initiated request, answered by the companion — notify the
      // requesting Sentinel, not the companion who just answered.
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-1',
        type: NotificationType.SENTINEL_LINK_ANSWERED,
        actorUserId: 'companion-1',
        actorLabel: 'Companion',
        accepted: true,
        targetId: 'link-1',
      });
    });

    it('rejects accepting directly into the reserve circle', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(
        pendingSentinelRequest,
      );
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'companion-1',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
      });

      await expect(
        service.respondToMembership('companion-1', 'link-1', true, 'reserve-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('ignores circleId for a Companion-initiated invite', async () => {
      const pendingInvite = {
        ...pendingSentinelRequest,
        initiatedBy: LinkInitiator.COMPANION,
      };
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(pendingInvite);
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.respondToMembership('sentinel-1', 'link-1', true);

      expect(prisma.circle.findUnique).not.toHaveBeenCalled();
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LinkStatus.ACCEPTED }),
        }),
      );
      // Companion-initiated invite, answered by the Sentinel — notify the
      // inviting companion, not the Sentinel who just answered.
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'companion-1',
        type: NotificationType.SENTINEL_LINK_ANSWERED,
        actorUserId: 'sentinel-1',
        actorLabel: 'Sentinel',
        accepted: true,
        targetId: 'link-1',
      });
    });
  });

  describe('updateCircle', () => {
    it('updates the label and the alert-chat rule on a BASIC circle', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'work-1',
        userCompanionId: 'me',
        circleType: CircleType.BASIC,
      });
      prisma.circle.update.mockResolvedValueOnce({ id: 'work-1' });

      await service.updateCircle('me', 'work-1', {
        label: 'Travail',
        alertChatWithFirstCircle: false,
      });

      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'work-1' },
        data: { label: 'Travail', alertChatWithFirstCircle: false },
      });
    });

    it('rejects the alert-chat rule on the 1st circle — it has its own room', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
      });

      await expect(
        service.updateCircle('me', 'first-1', {
          alertChatWithFirstCircle: false,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.circle.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteCircle', () => {
    it('cannot delete the 1st circle', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
      });

      await expect(service.deleteCircle('me', 'first-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('cannot delete the reserve circle', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
      });

      await expect(service.deleteCircle('me', 'reserve-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('relocates active Sentinels to the reserve circle instead of blocking', async () => {
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'choir-1',
        userCompanionId: 'me',
        circleType: CircleType.BASIC,
      });
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { id: 'link-1' },
        { id: 'link-2' },
      ]);
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'reserve-1',
        circleType: CircleType.RESERVED,
      });

      const result = await service.deleteCircle('me', 'choir-1');

      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['link-1', 'link-2'] } },
        data: { circleId: 'reserve-1' },
      });
      expect(prisma.circle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'choir-1' },
          data: expect.objectContaining({ status: CircleStatus.CLOSED }),
        }),
      );
      expect(result).toEqual({ deleted: true, movedToReserve: 2 });
    });
  });

  describe('groups', () => {
    describe('createGroup', () => {
      it('creates the founder’s own GROUP circle', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({
          id: 'alice',
          userType: UserType.ACCOUNT,
          paidUntil: new Date('2999-01-01'),
        });
        prisma.circle.create.mockResolvedValueOnce({ id: 'root-1' });

        await groups.createGroup('alice', { label: 'Choir' });

        expect(prisma.circle.create).toHaveBeenCalledWith({
          data: {
            userCompanionId: 'alice',
            label: 'Choir',
            circleType: CircleType.GROUP,
          },
        });
      });

      it('rejects founding a group for an unpaid account', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({
          id: 'alice',
          userType: UserType.ACCOUNT,
          paidUntil: null,
        });

        await expect(
          groups.createGroup('alice', { label: 'Choir' }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.circle.create).not.toHaveBeenCalled();
      });
    });

    describe('listMyGroups', () => {
      it('flags the founder and lists every member', async () => {
        prisma.circle.findMany
          .mockResolvedValueOnce([
            { id: 'root-1', groupRootId: null }, // alice is the founder here
            { id: 'circle-alice-2', groupRootId: 'root-2' }, // alice just a member here
          ])
          .mockResolvedValueOnce([
            {
              id: 'root-1',
              label: 'Choir',
              groupRootId: null,
              userCompanion: { id: 'alice', firstName: 'Alice' },
            },
            {
              id: 'circle-bob',
              label: 'Choir',
              groupRootId: 'root-1',
              userCompanion: { id: 'bob', firstName: 'Bob' },
            },
            {
              id: 'root-2',
              label: 'Band',
              groupRootId: null,
              userCompanion: { id: 'carol', firstName: 'Carol' },
            },
            {
              id: 'circle-alice-2',
              label: 'Band',
              groupRootId: 'root-2',
              userCompanion: { id: 'alice', firstName: 'Alice' },
            },
          ]);

        const result = await groups.listMyGroups('alice');

        expect(result).toEqual([
          {
            rootId: 'root-1',
            label: 'Choir',
            isFounder: true,
            members: [
              { id: 'alice', firstName: 'Alice' },
              { id: 'bob', firstName: 'Bob' },
            ],
          },
          {
            rootId: 'root-2',
            label: 'Band',
            isFounder: false,
            members: [
              { id: 'carol', firstName: 'Carol' },
              { id: 'alice', firstName: 'Alice' },
            ],
          },
        ]);
      });

      it('returns an empty list with no extra query when the caller is in no groups', async () => {
        prisma.circle.findMany.mockResolvedValueOnce([]);

        const result = await groups.listMyGroups('alice');

        expect(result).toEqual([]);
        expect(prisma.circle.findMany).toHaveBeenCalledTimes(1);
      });
    });

    describe('inviteToGroup', () => {
      it('rejects an inviter who is not a member of the group', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({
          id: 'alice',
          userType: UserType.ACCOUNT,
        });
        prisma.circle.findFirst.mockResolvedValueOnce(null);

        await expect(
          groups.inviteToGroup('alice', 'root-1', { targetUserId: 'bob' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects inviting a target the inviter is not already connected to', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({ id: 'alice', userType: UserType.ACCOUNT })
          .mockResolvedValueOnce({ id: 'bob', userType: UserType.ACCOUNT });
        prisma.circle.findFirst.mockResolvedValueOnce({ id: 'root-1' });
        prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

        await expect(
          groups.inviteToGroup('alice', 'root-1', { targetUserId: 'bob' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects inviting a target with no account', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({ id: 'alice', userType: UserType.ACCOUNT })
          .mockResolvedValueOnce({ id: 'bob', userType: UserType.ONLY_SMS });
        prisma.circle.findFirst.mockResolvedValueOnce({ id: 'root-1' });

        await expect(
          groups.inviteToGroup('alice', 'root-1', { targetUserId: 'bob' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates the invitation and notifies the target when eligible', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({
            id: 'alice',
            firstName: 'Alice',
            userType: UserType.ACCOUNT,
          })
          .mockResolvedValueOnce({ id: 'bob', userType: UserType.ACCOUNT });
        prisma.circle.findFirst
          .mockResolvedValueOnce({ id: 'root-1' }) // membership check
          .mockResolvedValueOnce(null); // not already a member
        prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(null);
        prisma.sentinelGroupInvitation.create.mockResolvedValueOnce({
          id: 'invite-1',
        });

        await groups.inviteToGroup('alice', 'root-1', { targetUserId: 'bob' });

        expect(prisma.sentinelGroupInvitation.create).toHaveBeenCalledWith({
          data: {
            groupRootId: 'root-1',
            invitedUserId: 'bob',
            invitedById: 'alice',
          },
        });
        expect(notifications.create).toHaveBeenCalledWith({
          userId: 'bob',
          type: NotificationType.SENTINEL_GROUP_INVITED,
          actorUserId: 'alice',
          actorLabel: 'Alice',
          targetId: 'invite-1',
        });
      });

      it('rejects inviting someone with an already-pending invitation', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce({ id: 'alice', userType: UserType.ACCOUNT })
          .mockResolvedValueOnce({ id: 'bob', userType: UserType.ACCOUNT });
        prisma.circle.findFirst
          .mockResolvedValueOnce({ id: 'root-1' })
          .mockResolvedValueOnce(null);
        prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce({
          id: 'invite-1',
          status: LinkStatus.PENDING,
        });

        await expect(
          groups.inviteToGroup('alice', 'root-1', { targetUserId: 'bob' }),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('moveSelfToReserve', () => {
      const link = (circleType: CircleType, overrides = {}) => ({
        id: 'link-1',
        userSentinelId: 'sam',
        userCompanionId: 'hugo',
        circleId: 'circle-1',
        status: LinkStatus.ACCEPTED,
        leadSlot: null,
        circle: { id: 'circle-1', circleType },
        linkAsSentinel: { id: 'sam', firstName: 'Sam' },
        userCompanion: { id: 'hugo', firstName: 'Hugo' },
        ...overrides,
      });

      it('moves me into their reserve, drops any Lead slot and tells them', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(
          link(CircleType.FIRST, { leadSlot: LeadSlot.LEAD_2 }),
        );
        prisma.linkSentinels.count
          .mockResolvedValueOnce(2) // other active members
          .mockResolvedValueOnce(1); // another Lead left
        prisma.alertParticipant.count.mockResolvedValueOnce(0);
        prisma.circle.findFirst.mockResolvedValueOnce({ id: 'reserve-1' });

        await service.moveSelfToReserve('sam', 'link-1');

        expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
          where: { id: 'link-1' },
          data: {
            circleId: 'reserve-1',
            leadSlot: null,
            requestedAsLead: false,
            proposedCircleId: null,
            callOrder: null,
          },
        });
        expect(notifications.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'hugo',
            type: NotificationType.SENTINEL_TO_RESERVE,
            actorUserId: 'sam',
          }),
        );
      });

      it('refuses the only Lead', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(
          link(CircleType.FIRST, { leadSlot: LeadSlot.LEAD_1 }),
        );
        prisma.linkSentinels.count
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(0);

        await expect(
          service.moveSelfToReserve('sam', 'link-1'),
        ).rejects.toThrow(ConflictException);
        expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
      });

      it('refuses while I take part in an alert about them', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(
          link(CircleType.BASIC),
        );
        prisma.alertParticipant.count.mockResolvedValueOnce(1);

        await expect(
          service.moveSelfToReserve('sam', 'link-1'),
        ).rejects.toThrow(ConflictException);
        expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
      });

      it.each([
        ['someone else', 'other', link(CircleType.BASIC), ForbiddenException],
        [
          'already in reserve',
          'sam',
          link(CircleType.RESERVED),
          ConflictException,
        ],
        ['a group link', 'sam', link(CircleType.GROUP), BadRequestException],
        [
          'a link that is not active',
          'sam',
          link(CircleType.BASIC, { status: LinkStatus.REMOVED }),
          ConflictException,
        ],
      ])('refuses %s', async (_label, caller, row, error) => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(row);

        await expect(
          service.moveSelfToReserve(caller, 'link-1'),
        ).rejects.toThrow(error);
      });
    });

    describe('inviteToGroup by phone', () => {
      const alice = {
        id: 'alice',
        firstName: 'Alice',
        phone: '+41790000001',
        userType: UserType.ACCOUNT,
      };

      it('invites a number with no account: creates a stand-in and sends the sign-up SMS', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce(alice) // inviter
          .mockResolvedValueOnce(null); // nobody with this number
        prisma.user.create.mockResolvedValueOnce({
          id: 'dan',
          phone: '+41790000009',
          userType: UserType.ONLY_SMS,
        });
        prisma.circle.findFirst
          .mockResolvedValueOnce({ id: 'root-1' }) // I'm a member
          .mockResolvedValueOnce(null); // not already a member
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(null);
        prisma.sentinelGroupInvitation.create.mockResolvedValueOnce({
          id: 'invite-9',
        });
        prisma.circle.findUnique.mockResolvedValueOnce({ label: 'Choir' });

        await groups.inviteToGroup('alice', 'root-1', {
          phone: '+41790000009',
          name: 'Dan',
        });

        expect(prisma.user.create).toHaveBeenCalledWith({
          data: {
            phone: '+41790000009',
            firstName: 'Dan',
            userType: UserType.ONLY_SMS,
            language: null,
          },
        });
        // No trust-chain check on this path.
        expect(prisma.linkSentinels.findFirst).not.toHaveBeenCalled();
        expect(prisma.sentinelGroupInvitation.create).toHaveBeenCalledWith({
          data: {
            groupRootId: 'root-1',
            invitedUserId: 'dan',
            invitedById: 'alice',
          },
        });
        expect(sms.send).toHaveBeenCalledWith(
          '+41790000009',
          expect.stringContaining('Creez votre compte avec ce numero'),
        );
      });

      it('invites a number that already has an account: SMS to log in', async () => {
        prisma.user.findUnique
          .mockResolvedValueOnce(alice)
          .mockResolvedValueOnce({
            id: 'bob',
            firstName: 'Bob',
            phone: '+41790000002',
            userType: UserType.ACCOUNT,
          });
        prisma.circle.findFirst
          .mockResolvedValueOnce({ id: 'root-1' })
          .mockResolvedValueOnce(null);
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(null);
        prisma.sentinelGroupInvitation.create.mockResolvedValueOnce({
          id: 'invite-2',
        });
        prisma.circle.findUnique.mockResolvedValueOnce({ label: 'Choir' });

        await groups.inviteToGroup('alice', 'root-1', {
          phone: '+41790000002',
          name: 'Bob',
        });

        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(notifications.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'bob',
            type: NotificationType.SENTINEL_GROUP_INVITED,
          }),
        );
        expect(sms.send).toHaveBeenCalledWith(
          '+41790000002',
          expect.stringContaining('Connectez-vous pour accepter ou refuser'),
        );
      });

      it.each([
        ['without a first name', { phone: '+41790000009', name: ' ' }],
        ['with my own number', { phone: '+41790000001', name: 'Me' }],
        ['with neither a contact nor a number', {}],
      ])('rejects an invitation %s', async (_label, dto) => {
        prisma.user.findUnique.mockResolvedValueOnce(alice);
        prisma.circle.findFirst.mockResolvedValueOnce({ id: 'root-1' });

        await expect(
          groups.inviteToGroup('alice', 'root-1', dto),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.sentinelGroupInvitation.create).not.toHaveBeenCalled();
      });
    });

    describe('respondToGroupInvitation', () => {
      const pendingInvitation = (overrides: Record<string, unknown> = {}) => ({
        id: 'invite-1',
        invitedUserId: 'carol',
        groupRootId: 'root-1',
        status: LinkStatus.PENDING,
        groupRoot: { id: 'root-1', label: 'Choir' },
        ...overrides,
      });

      it('refuses accepting from an SMS-only login: an account is needed first', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );
        prisma.user.findUnique.mockResolvedValueOnce({
          userType: UserType.ONLY_SMS,
        });

        await expect(
          groups.respondToGroupInvitation('carol', 'invite-1', true),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.sentinelGroupInvitation.update).not.toHaveBeenCalled();
      });

      it('creates the full mesh when accepting, with 2 existing members', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );
        prisma.circle.findMany.mockResolvedValueOnce([
          { id: 'root-1', userCompanionId: 'alice' },
          { id: 'circle-bob', userCompanionId: 'bob' },
        ]);
        prisma.circle.findUnique.mockResolvedValueOnce(null); // no previous circle for this group
        prisma.circle.create.mockResolvedValueOnce({
          id: 'circle-carol',
          userCompanionId: 'carol',
        });
        prisma.linkSentinels.findUnique.mockResolvedValue(null);

        await groups.respondToGroupInvitation('carol', 'invite-1', true);

        expect(prisma.sentinelGroupInvitation.update).toHaveBeenCalledWith({
          where: { id: 'invite-1' },
          data: { status: LinkStatus.ACCEPTED },
        });
        expect(prisma.circle.create).toHaveBeenCalledWith({
          data: {
            userCompanionId: 'carol',
            label: 'Choir',
            circleType: CircleType.GROUP,
            groupRootId: 'root-1',
          },
        });
        expect(prisma.linkSentinels.create).toHaveBeenCalledTimes(4); // 2 members x 2 directions
        expect(prisma.linkSentinels.create).toHaveBeenCalledWith({
          data: {
            userSentinelId: 'carol',
            userCompanionId: 'alice',
            circleId: 'root-1',
            status: LinkStatus.ACCEPTED,
            initiatedBy: LinkInitiator.COMPANION,
            sentinelType: SentinelType.SENTINEL,
          },
        });
        expect(prisma.linkSentinels.create).toHaveBeenCalledWith({
          data: {
            userSentinelId: 'alice',
            userCompanionId: 'carol',
            circleId: 'circle-carol',
            status: LinkStatus.ACCEPTED,
            initiatedBy: LinkInitiator.COMPANION,
            sentinelType: SentinelType.SENTINEL,
          },
        });
      });

      it('reactivates a previous closed circle and removed relationships when rejoining', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );
        prisma.circle.findMany.mockResolvedValueOnce([
          { id: 'root-1', userCompanionId: 'alice' },
        ]);
        // carol already has a (closed) circle for this group from a
        // previous membership — @@unique([userCompanionId, groupRootId])
        // means it must be reused, not re-created.
        prisma.circle.findUnique.mockResolvedValueOnce({
          id: 'circle-carol',
          status: CircleStatus.CLOSED,
        });
        prisma.circle.update.mockResolvedValueOnce({
          id: 'circle-carol',
          status: CircleStatus.ACTIVE,
        });
        prisma.linkSentinels.findUnique
          .mockResolvedValueOnce({ id: 'l1', status: LinkStatus.REMOVED }) // carol -> alice
          .mockResolvedValueOnce({ id: 'l2', status: LinkStatus.REMOVED }); // alice -> carol

        await groups.respondToGroupInvitation('carol', 'invite-1', true);

        expect(prisma.circle.create).not.toHaveBeenCalled();
        expect(prisma.circle.update).toHaveBeenCalledWith({
          where: { id: 'circle-carol' },
          data: { status: CircleStatus.ACTIVE, closedAt: null },
        });
        expect(prisma.linkSentinels.create).not.toHaveBeenCalled();
        expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
          where: { id: 'l1' },
          data: { status: LinkStatus.ACCEPTED, circleId: 'root-1' },
        });
        expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
          where: { id: 'l2' },
          data: { status: LinkStatus.ACCEPTED, circleId: 'circle-carol' },
        });
      });

      it('skips a member already connected to the invitee from outside the group', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );
        prisma.circle.findMany.mockResolvedValueOnce([
          { id: 'root-1', userCompanionId: 'alice' },
          { id: 'circle-bob', userCompanionId: 'bob' },
        ]);
        prisma.circle.findUnique.mockResolvedValueOnce(null); // no previous circle for this group
        prisma.circle.create.mockResolvedValueOnce({
          id: 'circle-carol',
          userCompanionId: 'carol',
        });
        prisma.linkSentinels.findUnique
          .mockResolvedValueOnce(null) // carol -> alice: not yet connected
          .mockResolvedValueOnce(null) // alice -> carol: not yet connected
          .mockResolvedValueOnce({ id: 'l1', status: LinkStatus.ACCEPTED }) // carol -> bob: already connected
          .mockResolvedValueOnce({ id: 'l2', status: LinkStatus.ACCEPTED }); // bob -> carol: already connected

        await groups.respondToGroupInvitation('carol', 'invite-1', true);

        expect(prisma.linkSentinels.create).toHaveBeenCalledTimes(2); // alice <-> carol only
      });

      it('declines without touching LinkSentinels', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );
        prisma.sentinelGroupInvitation.update.mockResolvedValueOnce({
          id: 'invite-1',
          status: LinkStatus.DECLINED,
        });

        await groups.respondToGroupInvitation('carol', 'invite-1', false);

        expect(prisma.sentinelGroupInvitation.update).toHaveBeenCalledWith({
          where: { id: 'invite-1' },
          data: { status: LinkStatus.DECLINED },
        });
        expect(prisma.linkSentinels.create).not.toHaveBeenCalled();
      });

      it('rejects responding to an invitation not addressed to the caller', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation(),
        );

        await expect(
          groups.respondToGroupInvitation('mallory', 'invite-1', true),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects responding to an invitation that was already answered', async () => {
        prisma.sentinelGroupInvitation.findUnique.mockResolvedValueOnce(
          pendingInvitation({ status: LinkStatus.ACCEPTED }),
        );

        await expect(
          groups.respondToGroupInvitation('carol', 'invite-1', true),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('leaveGroup', () => {
      it('closes the caller’s circle and removes group-created relationships only', async () => {
        prisma.circle.findFirst.mockResolvedValueOnce({
          id: 'circle-carol',
          userCompanionId: 'carol',
        });
        prisma.circle.findMany.mockResolvedValueOnce([
          { id: 'root-1', userCompanionId: 'alice' },
          { id: 'circle-bob', userCompanionId: 'bob' },
          { id: 'circle-carol', userCompanionId: 'carol' },
        ]);
        prisma.linkSentinels.findMany
          .mockResolvedValueOnce([
            // carol <-> alice: created by the group (circleId is a group circle)
            { id: 'link-ca-1', circleId: 'root-1' },
            { id: 'link-ca-2', circleId: 'circle-carol' },
          ])
          .mockResolvedValueOnce([
            // carol <-> bob: predates the group (circleId is unrelated)
            { id: 'link-cb-1', circleId: 'some-other-circle' },
          ]);

        await groups.leaveGroup('carol', 'root-1');

        expect(prisma.circle.update).toHaveBeenCalledWith({
          where: { id: 'circle-carol' },
          data: expect.objectContaining({ status: CircleStatus.CLOSED }),
        });
        expect(prisma.linkSentinels.update).toHaveBeenCalledTimes(2);
        expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
          where: { id: 'link-ca-1' },
          data: { status: LinkStatus.REMOVED },
        });
        expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
          where: { id: 'link-ca-2' },
          data: { status: LinkStatus.REMOVED },
        });
      });

      it('rejects leaving a group the caller is not a member of', async () => {
        prisma.circle.findFirst.mockResolvedValueOnce(null);

        await expect(groups.leaveGroup('carol', 'root-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('deleteGroup', () => {
      const activeRoot = (overrides: Record<string, unknown> = {}) => ({
        id: 'root-1',
        userCompanionId: 'alice',
        circleType: CircleType.GROUP,
        groupRootId: null,
        status: CircleStatus.ACTIVE,
        ...overrides,
      });

      it('closes every member’s circle and unwinds every group-created relationship', async () => {
        prisma.circle.findUnique.mockResolvedValueOnce(activeRoot());
        prisma.circle.findMany.mockResolvedValueOnce([
          { id: 'root-1', userCompanionId: 'alice' },
          { id: 'circle-bob', userCompanionId: 'bob' },
        ]);
        prisma.linkSentinels.findMany.mockResolvedValue([
          { id: 'link-ab', circleId: 'root-1' },
        ]);

        await groups.deleteGroup('alice', 'root-1');

        expect(prisma.circle.update).toHaveBeenCalledWith({
          where: { id: 'root-1' },
          data: expect.objectContaining({ status: CircleStatus.CLOSED }),
        });
        expect(prisma.circle.update).toHaveBeenCalledWith({
          where: { id: 'circle-bob' },
          data: expect.objectContaining({ status: CircleStatus.CLOSED }),
        });
      });

      it('rejects a non-founder trying to delete the group', async () => {
        prisma.circle.findUnique.mockResolvedValueOnce(
          activeRoot({ userCompanionId: 'alice' }),
        );

        await expect(groups.deleteGroup('bob', 'root-1')).rejects.toThrow(
          ForbiddenException,
        );
        expect(prisma.circle.update).not.toHaveBeenCalled();
      });

      it('rejects deleting a group that does not exist', async () => {
        prisma.circle.findUnique.mockResolvedValueOnce(null);

        await expect(groups.deleteGroup('alice', 'root-1')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('rejects deleting an already-closed group', async () => {
        prisma.circle.findUnique.mockResolvedValueOnce(
          activeRoot({ status: CircleStatus.CLOSED }),
        );

        await expect(groups.deleteGroup('alice', 'root-1')).rejects.toThrow(
          ConflictException,
        );
      });
    });

    describe('listMyGroupInvitations', () => {
      it('lists pending invitations addressed to me', async () => {
        prisma.sentinelGroupInvitation.findMany.mockResolvedValueOnce([
          { id: 'invite-1', groupRoot: { id: 'root-1', label: 'Choir' } },
        ]);

        const result = await groups.listMyGroupInvitations('carol');

        expect(prisma.sentinelGroupInvitation.findMany).toHaveBeenCalledWith({
          where: { invitedUserId: 'carol', status: LinkStatus.PENDING },
          include: {
            groupRoot: { select: { id: true, label: true } },
            invitedBy: { select: { id: true, firstName: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        expect(result).toEqual([
          { id: 'invite-1', groupRoot: { id: 'root-1', label: 'Choir' } },
        ]);
      });
    });
  });

  describe('updateMembership', () => {
    it('moves an accepted link into the reserve circle immediately, without a message', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_2,
        requestedAsLead: true,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: {
          userType: UserType.ACCOUNT,
          phone: '+33611111111',
          firstName: 'Ada',
        },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
        label: 'Sentinelles en réserve',
      });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        firstName: 'Me',
        phone: '+33622222222',
      }); // getUser(companion)
      // assertLeadPreserved: another active Lead exists, so the move is safe.
      prisma.linkSentinels.count
        .mockResolvedValueOnce(1) // otherActive
        .mockResolvedValueOnce(1); // otherLeads
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.updateMembership('me', 'link-1', {
        circleId: 'reserve-1',
      });

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: {
          circleId: 'reserve-1',
          sentinelType: SentinelType.SENTINEL,
          requestedAsLead: false,
          leadSlot: null,
        },
      });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('blocks moving a Lead away when it would strand the 1st circle', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_1,
        requestedAsLead: true,
        sentinelType: SentinelType.LEAD,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: {
          userType: UserType.ACCOUNT,
          phone: '+33611111111',
          firstName: 'Ada',
        },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
        label: 'Sentinelles en réserve',
      });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        firstName: 'Me',
        phone: '+33622222222',
      }); // getUser(companion)
      prisma.linkSentinels.count
        .mockResolvedValueOnce(1) // otherActive: another member remains
        .mockResolvedValueOnce(0); // otherLeads: nobody else leads

      await expect(
        service.updateMembership('me', 'link-1', {
          circleId: 'reserve-1',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('rejects moving into a closed circle', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'old-1',
        userCompanionId: 'me',
        circleType: CircleType.BASIC,
        status: CircleStatus.CLOSED,
      });

      await expect(
        service.updateMembership('me', 'link-1', {
          circleId: 'old-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('proposes a move into the 1st circle instead of moving immediately', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: {
          userType: UserType.ACCOUNT,
          phone: '+33611111111',
          firstName: 'Ada',
        },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
        label: 'Premier cercle',
      });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        firstName: 'Me',
        phone: '+33622222222',
      }); // getUser(companion)
      prisma.linkSentinels.update.mockResolvedValueOnce({
        id: 'link-1',
        proposedCircleId: 'first-1',
      });

      const result = await service.updateMembership('me', 'link-1', {
        circleId: 'first-1',
      });

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { proposedCircleId: 'first-1' },
      });
      expect(sms.send).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.CIRCLE_MOVE_PROPOSED,
        }),
      );
      expect(result).toEqual({ id: 'link-1', proposedCircleId: 'first-1' });
      // Only the 1st circle's room check — no Lead-slot logic touched.
      expect(prisma.linkSentinels.count).toHaveBeenCalledTimes(1);
      expect(prisma.linkSentinels.count).toHaveBeenCalledWith({
        where: {
          circleId: 'first-1',
          status: { in: [LinkStatus.PENDING, LinkStatus.ACCEPTED] },
        },
      });
    });

    it('refuses a move into a 1st circle that already has 6 people', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: {
          userType: UserType.ACCOUNT,
          phone: '+33611111111',
          firstName: 'Ada',
        },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
        label: 'Premier cercle',
      });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'me',
        firstName: 'Me',
      });
      prisma.linkSentinels.count.mockResolvedValueOnce(6);

      await expect(
        service.updateMembership('me', 'link-1', { circleId: 'first-1' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    describe('Lead order (leadSlot)', () => {
      const lead2 = {
        id: 'link-2',
        status: LinkStatus.ACCEPTED,
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_2,
        requestedAsLead: true,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ACCOUNT },
      };

      it('swaps with the current holder of the slot', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(lead2);
        prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' }); // holds LEAD_1
        prisma.linkSentinels.update.mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...data }),
        );

        const result = await service.updateMembership('me', 'link-2', {
          leadSlot: LeadSlot.LEAD_1,
        });

        expect(prisma.linkSentinels.update.mock.calls.map((c) => c[0])).toEqual(
          [
            { where: { id: 'link-2' }, data: { leadSlot: null } },
            { where: { id: 'link-1' }, data: { leadSlot: LeadSlot.LEAD_2 } },
            { where: { id: 'link-2' }, data: { leadSlot: LeadSlot.LEAD_1 } },
          ],
        );
        expect(result).toEqual({ id: 'link-2', leadSlot: LeadSlot.LEAD_1 });
      });

      it('just takes a free slot', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce(lead2);
        prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);
        prisma.linkSentinels.update.mockResolvedValue({});

        await service.updateMembership('me', 'link-2', {
          leadSlot: LeadSlot.LEAD_3,
        });

        expect(prisma.linkSentinels.update).toHaveBeenCalledTimes(2);
      });

      it('refuses a Sentinel who is not a 1st-circle Lead', async () => {
        prisma.linkSentinels.findUnique.mockResolvedValueOnce({
          ...lead2,
          leadSlot: null,
        });

        await expect(
          service.updateMembership('me', 'link-2', {
            leadSlot: LeadSlot.LEAD_1,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    it('rejects updating a link that is not ACCEPTED (e.g. a REMOVED one)', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.REMOVED,
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });

      await expect(
        service.updateMembership('me', 'link-1', {
          circleId: 'reserve-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.circle.findUnique).not.toHaveBeenCalled();
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('sets the outer-circle call order used to batch alert escalation', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        callOrder: null,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ACCOUNT },
      });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.updateMembership('me', 'link-1', { callOrder: 2 });

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'link-1' },
          data: expect.objectContaining({ callOrder: 2 }),
        }),
      );
    });
  });

  describe('endRelationship', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'mine',
      status: LinkStatus.ACCEPTED,
      userCompanionId: 'me',
      userSentinelId: 'theo',
      circleId: 'circle-basic',
      leadSlot: null,
      circle: { circleType: CircleType.BASIC },
      linkAsSentinel: {
        id: 'theo',
        firstName: 'Théo',
        lastName: null,
        phone: '+41790000009',
      },
      userCompanion: {
        id: 'me',
        firstName: 'Me',
        lastName: null,
        phone: '+41790000008',
      },
      ...overrides,
    });
    const theirs = () =>
      row({
        id: 'theirs',
        userCompanionId: 'theo',
        userSentinelId: 'me',
        linkAsSentinel: {
          id: 'me',
          firstName: 'Me',
          lastName: null,
          phone: '+41790000008',
        },
        userCompanion: {
          id: 'theo',
          firstName: 'Théo',
          lastName: null,
          phone: '+41790000009',
        },
      });

    it('ends both directions: my Sentinel removed, and I leave theirs', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([row(), theirs()]);

      await expect(
        service.endRelationship('me', 'theo', false),
      ).resolves.toEqual({ ended: 2, blocked: false });

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'mine' },
        data: { status: LinkStatus.REMOVED },
      });
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'theirs' },
        data: { status: LinkStatus.REMOVED },
      });
      // Leaving their circle tells them, like leaving from the app.
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'theo',
          type: NotificationType.SENTINEL_LEFT,
        }),
      );
    });

    it('blocks both directions', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([row(), theirs()]);

      await service.endRelationship('me', 'theo', true);

      expect(prisma.linkSentinels.update).toHaveBeenCalledTimes(2);
      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'theirs' },
        data: { status: LinkStatus.BLOCKED },
      });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('changes nothing when one side is the last Lead of a 1st circle', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        row(),
        {
          ...theirs(),
          leadSlot: LeadSlot.LEAD_1,
          circle: { circleType: CircleType.FIRST },
        },
      ]);
      prisma.linkSentinels.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);

      await expect(
        service.endRelationship('me', 'theo', false),
      ).rejects.toThrow(ConflictException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('404s when there is no link with this person', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]);

      await expect(
        service.endRelationship('me', 'stranger', true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('canSendDirectMessage', () => {
    it('returns false when there is no accepted link between the two', async () => {
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null);

      const result = await service.canSendDirectMessage('me', 'sentinel-1');

      expect(result).toBe(false);
    });

    it('is always true with an accepted link, whatever the circle', async () => {
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });

      const result = await service.canSendDirectMessage('me', 'sentinel-1');

      expect(result).toBe(true);
    });

    it('resolves direction-agnostically — the caller can be the Sentinel side', async () => {
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({ id: 'link-1' });

      await service.canSendDirectMessage('sentinel-1', 'me');

      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { userCompanionId: 'sentinel-1', userSentinelId: 'me' },
              { userCompanionId: 'me', userSentinelId: 'sentinel-1' },
            ],
          }),
        }),
      );
    });
  });

  describe('respondToCircleMove', () => {
    const linkWithProposal = {
      id: 'link-1',
      userSentinelId: 'sentinel-1',
      proposedCircleId: 'first-1',
      circle: { id: 'work-1', circleType: CircleType.BASIC },
      linkAsSentinel: { phone: '+33611111111', firstName: 'Ada' },
      userCompanion: { phone: '+33622222222', firstName: 'Me' },
    };

    it('accepts: moves into the proposed circle and clears the proposal', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(linkWithProposal);
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.respondToCircleMove('sentinel-1', 'link-1', true);

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { circleId: 'first-1', proposedCircleId: null, leadSlot: null },
      });
    });

    it('declines: only clears the proposal, nothing else changes', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(linkWithProposal);
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.respondToCircleMove('sentinel-1', 'link-1', false);

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { proposedCircleId: null },
      });
    });

    it('rejects a caller who is not the Sentinel on this link', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(linkWithProposal);

      await expect(
        service.respondToCircleMove('someone-else', 'link-1', true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when there is no pending proposal', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        ...linkWithProposal,
        proposedCircleId: null,
      });

      await expect(
        service.respondToCircleMove('sentinel-1', 'link-1', true),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeMembership', () => {
    it('blocks removing the last Lead while other active members remain', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_1,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
      });
      prisma.linkSentinels.count
        .mockResolvedValueOnce(2) // otherActive
        .mockResolvedValueOnce(0); // otherLeads

      await expect(service.removeMembership('me', 'link-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });
  });

  describe('blockMembership', () => {
    it('blocks a PENDING link (an incoming request or an invite "Me" sent)', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.PENDING,
        circleId: 'first-1',
        leadSlot: null,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.blockMembership('me', 'link-1');

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { status: LinkStatus.BLOCKED },
      });
    });

    it('blocks an ACCEPTED link', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.blockMembership('me', 'link-1');

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { status: LinkStatus.BLOCKED },
      });
    });

    it('rejects blocking an already-blocked link', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.BLOCKED,
        circleId: 'work-1',
        leadSlot: null,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });

      await expect(service.blockMembership('me', 'link-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it("rejects blocking someone else's link", async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        circle: {
          userCompanionId: 'someone-else',
          circleType: CircleType.BASIC,
        },
        linkAsSentinel: { userType: UserType.ONLY_SMS },
      });

      await expect(service.blockMembership('me', 'link-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks removing the last Lead while other active members remain', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_1,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ACCOUNT },
      });
      prisma.linkSentinels.count
        .mockResolvedValueOnce(2) // otherActive
        .mockResolvedValueOnce(0); // otherLeads

      await expect(service.blockMembership('me', 'link-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });
  });

  describe('answerInvitation', () => {
    it('applies the answer and confirms by SMS', async () => {
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'other-link' });

      await service.answerInvitation(
        {
          id: 'other-link',
          initiatedBy: LinkInitiator.COMPANION,
          linkAsSentinel: { phone: '+33611111111', firstName: 'Ada' },
          userCompanion: { phone: '+33622222222', firstName: 'Me' },
        } as never,
        true,
      );

      expect(prisma.linkSentinels.update).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send.mock.calls[0][0]).toBe('+33611111111');
    });
  });

  describe('listMyDeathNotices', () => {
    it('only reads notices actually sent to the caller', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          deathPersonalMessage: 'Merci',
          userCompanion: {
            firstName: 'Marc',
            lastName: 'Dupont',
            deathAnnouncementMessage: 'Annonce',
          },
        },
      ]);

      await expect(
        deathNotice.listMyDeathNotices('sentinel-1'),
      ).resolves.toEqual([
        {
          companionName: 'Marc Dupont',
          announcementMessage: 'Annonce',
          personalMessage: 'Merci',
        },
      ]);
      expect(prisma.linkSentinels.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userSentinelId: 'sentinel-1',
            notifyOnDeath: true,
            deathNotifiedAt: { not: null },
          },
        }),
      );
    });
  });

  describe('leaveLinkBySms', () => {
    const lastLead = {
      id: 'link-1',
      circleId: 'first-1',
      leadSlot: LeadSlot.LEAD_1,
      circle: { circleType: CircleType.FIRST },
      linkAsSentinel: { phone: '+33611111111', firstName: 'Lea' },
      userCompanion: { phone: '+33622222222', firstName: 'Marc' },
    };

    it('keeps a last Lead in place, and tells both people why', async () => {
      prisma.linkSentinels.count
        .mockResolvedValueOnce(2) // other active members
        .mockResolvedValueOnce(0); // other Leads

      await expect(service.leaveLinkBySms(lastLead as never)).resolves.toBe(
        false,
      );

      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledWith(
        '+33611111111',
        expect.stringContaining('renvoyez STOP'),
      );
      expect(sms.send).toHaveBeenCalledWith(
        '+33622222222',
        expect.stringContaining('Designez-en un autre'),
      );
    });

    it('warns "Me" when a last Lead alone in the circle leaves', async () => {
      prisma.linkSentinels.count.mockResolvedValue(0);
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await expect(service.leaveLinkBySms(lastLead as never)).resolves.toBe(
        true,
      );

      expect(prisma.linkSentinels.update).toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledWith(
        '+33622222222',
        expect.stringContaining('plus de Lead Sentinel'),
      );
    });
  });

  describe('reportDeath', () => {
    it('reports a death when called by an accepted Lead of the 1st circle, notifying the other eligible confirmers', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'companion-1',
          status: 'ACTIVE',
          deathReportedAt: null,
        }) // getUser(companion)
        .mockResolvedValueOnce({
          id: 'lead-1',
          firstName: 'Lea',
          phone: '+41791111111',
        }); // getUser(reporter)
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'first-1',
        circleType: CircleType.FIRST,
      });
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'caller-link',
      }); // caller is an accepted Lead there
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { userSentinelId: 'lead-1' },
        { userSentinelId: 'lead-2' },
      ]); // getEligibleConfirmerIds: 2 Leads

      const result = await deathNotice.reportDeath('lead-1', 'companion-1');

      expect(result).toEqual({ reported: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'companion-1' },
        data: {
          deathReportedAt: expect.any(Date),
          deathReportedById: 'lead-1',
        },
      });
      // Only the other Lead is notified, never the reporter themself.
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'lead-2',
        type: NotificationType.DEATH_NOTICE_REPORTED,
        actorUserId: 'lead-1',
        actorLabel: 'Lea',
        targetId: 'companion-1',
      });
    });

    it('rejects when the caller is not an accepted Lead of the companion’s 1st circle', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        status: 'ACTIVE',
        deathReportedAt: null,
      });
      prisma.circle.findFirst.mockResolvedValueOnce({
        id: 'first-1',
        circleType: CircleType.FIRST,
      });
      prisma.linkSentinels.findFirst.mockResolvedValueOnce(null); // not a Lead there

      await expect(
        deathNotice.reportDeath('stranger', 'companion-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when a death report is already pending for this companion', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        status: 'ACTIVE',
        deathReportedAt: new Date(),
      });

      await expect(
        deathNotice.reportDeath('lead-1', 'companion-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the companion is already deceased', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        status: 'DECEASED',
        deathReportedAt: null,
      });

      await expect(
        deathNotice.reportDeath('lead-1', 'companion-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('confirmDeath', () => {
    it('marks the companion deceased and fans out the announcement, reading only opted-in accepted links', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'companion-1',
          deathReportedAt: new Date(),
          deathReportedById: 'lead-1',
        }) // getUser(companion)
        .mockResolvedValueOnce({
          firstName: 'Alice',
          phone: '+41790000000',
          deathAnnouncementMessage: 'Au revoir a tous.',
        }); // fanOutDeathAnnouncement: companion label + message
      prisma.circle.findFirst.mockResolvedValueOnce({ id: 'first-1' });
      prisma.linkSentinels.findMany
        .mockResolvedValueOnce([
          { userSentinelId: 'lead-1' },
          { userSentinelId: 'lead-2' },
        ]) // getEligibleConfirmerIds: 2 Leads
        .mockResolvedValueOnce([
          {
            id: 'link-r1',
            deathPersonalMessage: 'Tu vas nous manquer',
            linkAsSentinel: { id: 'sentinel-r1', phone: '+41791111111' },
          },
        ]); // fan-out: opted-in ACCEPTED recipients

      const result = await deathNotice.confirmDeath('lead-2', 'companion-1');

      expect(result).toEqual({ confirmed: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'companion-1' },
        data: {
          status: 'DECEASED',
          deceasedAt: expect.any(Date),
          deathConfirmedById: 'lead-2',
        },
      });
      // The fan-out query itself excludes removed/declined/blocked links and
      // anyone not opted in — a service-layer filter, not a DB constraint.
      expect(prisma.linkSentinels.findMany).toHaveBeenLastCalledWith({
        where: {
          userCompanionId: 'companion-1',
          status: LinkStatus.ACCEPTED,
          notifyOnDeath: true,
        },
        include: {
          linkAsSentinel: { select: { id: true, phone: true, language: true } },
        },
      });
      // Neither the name nor the announcement: they wait behind the login.
      expect(sms.send).toHaveBeenCalledWith(
        '+41791111111',
        expect.not.stringContaining('Alice'),
      );
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'sentinel-r1',
        type: NotificationType.DEATH_NOTICE_CONFIRMED,
        targetId: 'companion-1',
      });
      expect(prisma.linkSentinels.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['link-r1'] } },
        data: { deathNotifiedAt: expect.any(Date) },
      });
    });

    it('allows any other accepted Sentinel to confirm when the 1st circle has only one Lead', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'companion-1',
          deathReportedAt: new Date(),
          deathReportedById: 'lead-1',
        })
        .mockResolvedValueOnce({
          firstName: 'Alice',
          phone: null,
          deathAnnouncementMessage: '',
        });
      prisma.circle.findFirst.mockResolvedValueOnce({ id: 'first-1' });
      prisma.linkSentinels.findMany
        .mockResolvedValueOnce([{ userSentinelId: 'lead-1' }]) // only one Lead -> fallback
        .mockResolvedValueOnce([{ userSentinelId: 'sentinel-2' }]) // fallback: other accepted Sentinels
        .mockResolvedValueOnce([]); // fan-out: nobody opted in

      const result = await deathNotice.confirmDeath(
        'sentinel-2',
        'companion-1',
      );

      expect(result).toEqual({ confirmed: true });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('rejects when the caller is the original reporter', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        deathReportedAt: new Date(),
        deathReportedById: 'lead-1',
      });
      prisma.circle.findFirst.mockResolvedValueOnce({ id: 'first-1' });

      await expect(
        deathNotice.confirmDeath('lead-1', 'companion-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when there is no pending death report for this companion', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        deathReportedAt: null,
        deathReportedById: null,
      });

      await expect(
        deathNotice.confirmDeath('lead-2', 'companion-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.circle.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('rejectDeathReport', () => {
    it('clears the pending report and notifies the original reporter', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'companion-1',
        deathReportedAt: new Date(),
        deathReportedById: 'lead-1',
      });
      prisma.circle.findFirst.mockResolvedValueOnce({ id: 'first-1' });
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        { userSentinelId: 'lead-1' },
        { userSentinelId: 'lead-2' },
      ]);

      const result = await deathNotice.rejectDeathReport(
        'lead-2',
        'companion-1',
      );

      expect(result).toEqual({ rejected: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'companion-1' },
        data: { deathReportedAt: null, deathReportedById: null },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'lead-1',
        type: NotificationType.DEATH_NOTICE_REJECTED,
        actorUserId: 'lead-2',
        targetId: 'companion-1',
      });
    });
  });

  describe('listCompanions — death notice', () => {
    it('flags canReport for an accepted Lead of the 1st circle with no pending report', async () => {
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          id: 'link-1',
          sentinelType: SentinelType.FIRSTCIRCLE,
          leadSlot: LeadSlot.LEAD_1,
          proposedCircleId: null,
          circle: {
            id: 'first-1',
            label: '1er cercle',
            circleType: CircleType.FIRST,
            userCompanion: {
              id: 'companion-1',
              email: null,
              phone: '+41790000000',
              status: 'ACTIVE',
              deathReportedAt: null,
              deathReportedById: null,
            },
          },
        },
      ]);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          circleId: 'first-1',
          leadSlot: null,
          linkAsSentinel: {
            id: 'sentinel-2',
            firstName: 'Chloé',
            lastName: 'Morel',
          },
        },
      ]);

      const result = await service.listCompanions('lead-1');

      expect(result).toEqual([
        {
          linkId: 'link-1',
          sentinelType: SentinelType.FIRSTCIRCLE,
          leadSlot: LeadSlot.LEAD_1,
          circle: {
            id: 'first-1',
            label: '1er cercle',
            isPrimary: true,
            isReserve: false,
            isGroup: false,
          },
          proposedCircle: null,
          companion: {
            id: 'companion-1',
            email: null,
            phone: '+41790000000',
            subscribed: false,
            freeAlertUsed: false,
          },
          firstCircleMembers: [
            {
              id: 'sentinel-2',
              firstName: 'Chloé',
              lastName: 'Morel',
              subscribed: false,
              isLead: false,
            },
          ],
          phoneRecovery: null,
          deathNotice: { isDeceased: false, pending: null, canReport: true },
        },
      ]);
      expect(prisma.linkSentinels.groupBy).not.toHaveBeenCalled();
      // The other 1st-circle members are looked up without the caller.
      expect(prisma.linkSentinels.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            circleId: { in: ['first-1'] },
            status: LinkStatus.ACCEPTED,
            userSentinelId: { not: 'lead-1' },
          },
        }),
      );
    });

    it('flags canConfirmOrReject via the single-Lead fallback when a report is pending', async () => {
      const reportedAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.linkSentinels.findMany.mockResolvedValueOnce([
        {
          id: 'link-2',
          sentinelType: SentinelType.SENTINEL,
          leadSlot: null,
          proposedCircleId: null,
          circle: {
            id: 'first-1',
            label: '1er cercle',
            circleType: CircleType.FIRST,
            userCompanion: {
              id: 'companion-1',
              email: null,
              phone: '+41790000000',
              status: 'ACTIVE',
              deathReportedAt: reportedAt,
              deathReportedById: 'lead-1',
            },
          },
        },
      ]);
      prisma.linkSentinels.groupBy.mockResolvedValueOnce([
        { circleId: 'first-1', _count: { _all: 1 } },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'lead-1', firstName: 'Lea', phone: '+41791111111' },
      ]);
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]);

      const result = await service.listCompanions('sentinel-2');

      expect(result[0].deathNotice).toEqual({
        isDeceased: false,
        pending: {
          reportedAt,
          reportedByLabel: 'Lea',
          canConfirmOrReject: true,
        },
        canReport: false, // not a Lead here (leadSlot is null)
      });
    });
  });

  describe('after a confirmed death', () => {
    const deceased = { status: UserStatus.DECEASED };

    it('refuses changing, removing or blocking the deceased companion’s Sentinels', async () => {
      const link = {
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'first-1',
        leadSlot: null,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ACCOUNT },
        userCompanion: deceased,
      };
      prisma.linkSentinels.findUnique.mockResolvedValue(link);

      await expect(
        service.updateMembership('me', 'link-1', { circleId: 'work-1' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.removeMembership('me', 'link-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.blockMembership('me', 'link-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });

    it('refuses a Sentinel leaving, going to the reserve or answering a move', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValue({
        id: 'link-1',
        userSentinelId: 'sentinel-1',
        status: LinkStatus.ACCEPTED,
        proposedCircleId: 'first-1',
        circle: { id: 'work-1', circleType: CircleType.BASIC },
        linkAsSentinel: { phone: '+33611111111', firstName: 'Ada' },
        userCompanion: { ...deceased, phone: null, firstName: 'Me' },
      });

      await expect(
        service.leaveMembershipAsSentinel('sentinel-1', 'link-1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.moveSelfToReserve('sentinel-1', 'link-1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.respondToCircleMove('sentinel-1', 'link-1', true),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.linkSentinels.update).not.toHaveBeenCalled();
    });
  });
});
