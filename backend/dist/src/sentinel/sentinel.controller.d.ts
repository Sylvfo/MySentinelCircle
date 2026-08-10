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
        label: string;
        isPrimary: boolean;
        ownerId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    listCircles(user: {
        userId: string;
    }): Promise<({
        memberships: ({
            contact: {
                name: string;
                phone: string;
                userId: string | null;
                id: string;
            };
        } & {
            id: string;
            createdAt: Date;
            sentinelType: import("@prisma/client").$Enums.SentinelType;
            isReference: boolean;
            circleId: string;
            contactId: string;
            status: import("@prisma/client").$Enums.MembershipStatus;
            initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
        })[];
    } & {
        id: string;
        createdAt: Date;
        label: string;
        isPrimary: boolean;
        ownerId: string;
    })[]>;
    updateCircle(user: {
        userId: string;
    }, id: string, dto: UpdateCircleDto): Promise<{
        id: string;
        createdAt: Date;
        label: string;
        isPrimary: boolean;
        ownerId: string;
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
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    request(user: {
        userId: string;
    }, dto: RequestSentinelDto): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    incomingRequests(user: {
        userId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<({
        contact: {
            name: string;
            phone: string;
            userId: string | null;
            id: string;
        };
        circle: {
            id: string;
            label: string;
        };
    } & {
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    })[]>;
    myInvitations(user: {
        userId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<({
        circle: {
            id: string;
            label: string;
            owner: {
                email: string | null;
                phone: string;
                id: string;
            };
        };
    } & {
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    })[]>;
    accept(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    decline(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    leave(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    updateMembership(user: {
        userId: string;
    }, id: string, dto: UpdateMembershipDto): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    removeMembership(user: {
        userId: string;
    }, id: string): Promise<{
        deleted: boolean;
    }>;
    companions(user: {
        userId: string;
    }): Promise<{
        membershipId: string;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circle: {
            id: string;
            label: string;
            isPrimary: boolean;
        };
        companion: {
            email: string | null;
            phone: string;
            id: string;
        };
    }[]>;
}
