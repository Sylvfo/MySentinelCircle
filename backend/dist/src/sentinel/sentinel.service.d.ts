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
        updatedAt: Date;
        status: import("@prisma/client").$Enums.CircleStatus;
        label: string;
        groupChat: boolean;
        canSendPhone: boolean;
        userCompanionId: string;
        closedAt: Date | null;
        circleType: import("@prisma/client").$Enums.CircleType;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    listCircles(userId: string): Promise<({
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
    updateCircle(userId: string, circleId: string, dto: UpdateCircleDto): Promise<{
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
    deleteCircle(userId: string, circleId: string): Promise<{
        deleted: boolean;
    }>;
    inviteSentinel(userId: string, circleId: string, dto: InviteSentinelDto): Promise<{
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
    requestToBeSentinel(requesterId: string, dto: RequestSentinelDto): Promise<{
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
    listMyInvitations(userId: string): Prisma.PrismaPromise<({
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
    listIncomingRequests(userId: string): Prisma.PrismaPromise<({
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
    respondToMembership(userId: string, linkId: string, accept: boolean): Promise<{
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
    handleInboundSms(from: string, body: string): Promise<{
        matched: false;
        reason: string;
        action?: undefined;
    } | {
        matched: true;
        action: string;
        reason?: undefined;
    }>;
    leaveMembershipAsSentinel(userId: string, linkId: string): Promise<{
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
    listCompanions(userId: string): Promise<{
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
    updateMembership(userId: string, linkId: string, dto: UpdateMembershipDto): Promise<{
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
    removeMembership(userId: string, linkId: string): Promise<{
        deleted: boolean;
    }>;
    private findOrCreateUserByPhone;
    private createOrReactivateLink;
    private leaveLink;
    private applyResponse;
    private ensureCircleOwned;
    private getOwnedLink;
    private resolveLeadSlot;
    private assertLeadPreserved;
    private ensurePrimaryCircle;
    private getUser;
    private label;
    private sendSms;
}
