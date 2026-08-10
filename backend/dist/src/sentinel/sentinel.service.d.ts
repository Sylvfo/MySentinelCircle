import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SmsSender } from '../sms/sms-sender.interface';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { InviteSentinelDto } from './dto/invite-sentinel.dto';
import { RequestSentinelDto } from './dto/request-sentinel.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
export declare class SentinelService {
    private readonly prisma;
    private readonly sms;
    constructor(prisma: PrismaService, sms: SmsSender);
    createCircle(userId: string, dto: CreateCircleDto): Prisma.Prisma__CircleClient<{
        id: string;
        createdAt: Date;
        label: string;
        isPrimary: boolean;
        ownerId: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    listCircles(userId: string): Promise<({
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
    updateCircle(userId: string, circleId: string, dto: UpdateCircleDto): Promise<{
        id: string;
        createdAt: Date;
        label: string;
        isPrimary: boolean;
        ownerId: string;
    }>;
    deleteCircle(userId: string, circleId: string): Promise<{
        deleted: boolean;
    }>;
    inviteSentinel(userId: string, circleId: string, dto: InviteSentinelDto): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    requestToBeSentinel(requesterId: string, dto: RequestSentinelDto): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    listMyInvitations(userId: string): Prisma.PrismaPromise<({
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
    listIncomingRequests(userId: string): Prisma.PrismaPromise<({
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
    respondToMembership(userId: string, membershipId: string, accept: boolean): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    handleInboundSms(from: string, body: string): Promise<{
        matched: false;
        reason: string;
        action?: undefined;
    } | {
        matched: true;
        action: string;
        reason?: undefined;
    }>;
    leaveMembershipAsSentinel(userId: string, membershipId: string): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    listCompanions(userId: string): Promise<{
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
    updateMembership(userId: string, membershipId: string, dto: UpdateMembershipDto): Promise<{
        id: string;
        createdAt: Date;
        sentinelType: import("@prisma/client").$Enums.SentinelType;
        isReference: boolean;
        circleId: string;
        contactId: string;
        status: import("@prisma/client").$Enums.MembershipStatus;
        initiatedBy: import("@prisma/client").$Enums.InitiatedBy;
    }>;
    removeMembership(userId: string, membershipId: string): Promise<{
        deleted: boolean;
    }>;
    private leaveMembership;
    private applyResponse;
    private ensureCircleOwned;
    private getOwnedMembership;
    private resolveIsReference;
    private assertReferencePreserved;
    private ensurePrimaryCircle;
    private upsertContact;
    private assertNoActiveMembership;
    private getUser;
    private label;
}
