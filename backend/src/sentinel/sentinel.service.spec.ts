import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CircleStatus,
  CircleType,
  LeadSlot,
  LinkInitiator,
  LinkStatus,
  SentinelType,
  UserType,
} from '@prisma/client';
import { SentinelService } from './sentinel.service';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';

describe('SentinelService', () => {
  let service: SentinelService;
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
    };
    user: { findUnique: jest.Mock; create: jest.Mock };
  };
  let sms: { send: jest.Mock };

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
      },
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    sms = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentinelService,
        { provide: PrismaService, useValue: prisma },
        { provide: SMS_SENDER, useValue: sms },
      ],
    }).compile();

    service = module.get<SentinelService>(SentinelService);
  });

  describe('listCircles', () => {
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
      expect(result.map((c) => c.id)).toEqual(['first-1', 'basic-1', 'reserve-1']);
    });
  });

  describe('inviteSentinel', () => {
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
        .mockResolvedValueOnce({ id: 'me', userType: UserType.ACCOUNT, firstName: 'Me' }) // getUser(inviter)
        .mockResolvedValueOnce({ id: 'sentinel-1' }) // linkedUser lookup (has account)
        .mockResolvedValueOnce({ id: 'sentinel-1' }); // findOrCreateUserByPhone lookup
      prisma.linkSentinels.findUnique.mockResolvedValueOnce(null); // no existing link
      prisma.linkSentinels.findMany.mockResolvedValueOnce([]); // no active leads yet
      prisma.linkSentinels.create.mockResolvedValueOnce({ id: 'link-1' });

      await service.inviteSentinel('me', 'first-1', {
        phone: '+33612345678',
        name: 'Ada',
      } as any);

      expect(prisma.linkSentinels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leadSlot: LeadSlot.LEAD_1 }),
        }),
      );
    });
  });

  describe('requestToBeSentinel', () => {
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
        service.respondToMembership(
          'companion-1',
          'link-1',
          true,
          'reserve-1',
        ),
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

  describe('updateMembership', () => {
    it('moves an accepted link into the reserve circle immediately and notifies the Sentinel', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_2,
        requestedAsLead: true,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ACCOUNT, phone: '+33611111111', firstName: 'Ada' },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
        label: 'Sentinelles en réserve',
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', firstName: 'Me', phone: '+33622222222' }); // getUser(companion)
      // assertLeadPreserved: another active Lead exists, so the move is safe.
      prisma.linkSentinels.count
        .mockResolvedValueOnce(1) // otherActive
        .mockResolvedValueOnce(1); // otherLeads
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      await service.updateMembership('me', 'link-1', {
        circleId: 'reserve-1',
      } as any);

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: {
          circleId: 'reserve-1',
          sentinelType: SentinelType.SENTINEL,
          requestedAsLead: false,
          leadSlot: null,
        },
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+33611111111',
        expect.stringContaining('Sentinelles en réserve'),
      );
    });

    it('blocks moving a Lead away when it would strand the 1st circle', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        circleId: 'first-1',
        leadSlot: LeadSlot.LEAD_1,
        requestedAsLead: true,
        sentinelType: SentinelType.LEAD,
        circle: { userCompanionId: 'me', circleType: CircleType.FIRST },
        linkAsSentinel: { userType: UserType.ACCOUNT, phone: '+33611111111', firstName: 'Ada' },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'reserve-1',
        userCompanionId: 'me',
        circleType: CircleType.RESERVED,
        status: CircleStatus.ACTIVE,
        label: 'Sentinelles en réserve',
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', firstName: 'Me', phone: '+33622222222' }); // getUser(companion)
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
        circleId: 'work-1',
        leadSlot: null,
        requestedAsLead: false,
        sentinelType: SentinelType.SENTINEL,
        circle: { userCompanionId: 'me', circleType: CircleType.BASIC },
        linkAsSentinel: { userType: UserType.ACCOUNT, phone: '+33611111111', firstName: 'Ada' },
      });
      prisma.circle.findUnique.mockResolvedValueOnce({
        id: 'first-1',
        userCompanionId: 'me',
        circleType: CircleType.FIRST,
        status: CircleStatus.ACTIVE,
        label: 'Premier cercle',
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', firstName: 'Me', phone: '+33622222222' }); // getUser(companion)
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1', proposedCircleId: 'first-1' });

      const result = await service.updateMembership('me', 'link-1', {
        circleId: 'first-1',
      } as any);

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { proposedCircleId: 'first-1' },
      });
      expect(sms.send).toHaveBeenCalledWith(
        '+33611111111',
        expect.stringContaining('OUI'),
      );
      expect(result).toEqual({ id: 'link-1', proposedCircleId: 'first-1' });
      expect(prisma.linkSentinels.count).not.toHaveBeenCalled(); // no Lead-slot logic touched
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

    it('rejects blocking someone else\'s link', async () => {
      prisma.linkSentinels.findUnique.mockResolvedValueOnce({
        id: 'link-1',
        status: LinkStatus.ACCEPTED,
        circleId: 'work-1',
        leadSlot: null,
        circle: { userCompanionId: 'someone-else', circleType: CircleType.BASIC },
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

  describe('handleInboundSms — circle move proposal', () => {
    it('resolves a pending circle-move proposal via OUI/NON', async () => {
      prisma.linkSentinels.findFirst
        .mockResolvedValueOnce(null) // no fresh PENDING invite/request for this phone
        .mockResolvedValueOnce({
          id: 'link-1',
          proposedCircleId: 'first-1',
          circle: { id: 'work-1', circleType: CircleType.BASIC },
          linkAsSentinel: { phone: '+33611111111', firstName: 'Ada' },
          userCompanion: { phone: '+33622222222', firstName: 'Me' },
        }); // the move proposal lookup
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'link-1' });

      const result = await service.handleInboundSms('+33611111111', 'OUI');

      expect(prisma.linkSentinels.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { circleId: 'first-1', proposedCircleId: null, leadSlot: null },
      });
      expect(result).toEqual({
        matched: true,
        action: 'circle_move_accepted',
      });
    });

    it('lets a genuine fresh PENDING invite/request win over an existing move proposal', async () => {
      prisma.linkSentinels.findFirst.mockResolvedValueOnce({
        id: 'other-link',
        status: LinkStatus.PENDING,
        initiatedBy: LinkInitiator.COMPANION,
        circle: { id: 'first-1', circleType: CircleType.FIRST },
        linkAsSentinel: { phone: '+33611111111', firstName: 'Ada' },
        userCompanion: { phone: '+33622222222', firstName: 'Me' },
      });
      prisma.linkSentinels.update.mockResolvedValueOnce({ id: 'other-link' });

      const result = await service.handleInboundSms('+33611111111', 'OUI');

      expect(result).toEqual({ matched: true, action: 'accepted' });
      // The move-proposal lookup must never run once the fresh PENDING link matched.
      expect(prisma.linkSentinels.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});
