import { SentinelService } from './sentinel.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
export declare class SentinelController {
    private readonly sentinel;
    constructor(sentinel: SentinelService);
    createCircle(user: {
        userId: string;
    }, dto: CreateCircleDto): import("@prisma/client").Prisma.Prisma__CircleClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.CircleStatus;
        label: string;
        groupChat: boolean;
        canSendPhone: boolean;
        userCompanionId: string;
        closedAt: Date | null;
        circleType: import("@prisma/client").$Enums.CircleType;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    listCircles(user: {
        userId: string;
    }): Promise<({
        userSentinels: ({
            linkAsSentinel: {
                firstName: string;
                phone: string | null;
                id: string;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.LinkStatus;
            sentinelType: import("@prisma/client").$Enums.SentinelType;
            requestedAsLead: boolean;
            circleId: string;
            initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
            leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
            groupChat: boolean;
            chat: boolean;
            canSendPhone: boolean;
            userSentinelId: string;
            userCompanionId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.CircleStatus;
        label: string;
        groupChat: boolean;
        canSendPhone: boolean;
        userCompanionId: string;
        closedAt: Date | null;
        circleType: import("@prisma/client").$Enums.CircleType;
    })[]>;
    updateCircle(user: {
        userId: string;
    }, id: string, dto: UpdateCircleDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.CircleStatus;
        label: string;
        groupChat: boolean;
        canSendPhone: boolean;
        userCompanionId: string;
        closedAt: Date | null;
        circleType: import("@prisma/client").$Enums.CircleType;
    }>;
    deleteCircle(user: {
        userId: string;
    }, id: string): Promise<{
        deleted: boolean;
    }>;
    invite(user: {
        userId: string;
    }, circleId: string, dto: InviteSentinelDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    request(user: {
        userId: string;
    }, dto: RequestSentinelDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    incomingRequests(user: {
        userId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<({
        circle: {
            id: string;
            label: string;
        };
        linkAsSentinel: {
            firstName: string;
            phone: string | null;
            id: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    })[]>;
    myInvitations(user: {
        userId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<({
        circle: {
            id: string;
            label: string;
            userCompanion: {
                email: string | null;
                phone: string | null;
                id: string;
            };
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    })[]>;
    accept(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    decline(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    leave(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    updateMembership(user: {
        userId: string;
    }, id: string, dto: UpdateMembershipDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LinkStatus;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        requestedAsLead: boolean;
        circleId: string;
        initiatedBy: import("@prisma/client").$Enums.LinkInitiator;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        groupChat: boolean;
        chat: boolean;
        canSendPhone: boolean;
        userSentinelId: string;
        userCompanionId: string;
    }>;
    removeMembership(user: {
        userId: string;
    }, id: string): Promise<{
        deleted: boolean;
    }>;
    companions(user: {
        userId: string;
    }): Promise<{
        linkId: string;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        leadSlot: import("@prisma/client").$Enums.LeadSlot | null;
        circle: {
            id: string;
            label: string;
            isPrimary: boolean;
        };
        companion: {
            email: string | null;
            phone: string | null;
            id: string;
        };
    }[]>;
}
