"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentinelService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const sms_sender_interface_1 = require("../sms/sms-sender.interface");
const messages_1 = require("../sms/messages");
const ACTIVE_STATUSES = [client_1.LinkStatus.PENDING, client_1.LinkStatus.ACCEPTED];
const LEAD_SLOTS = [
    client_1.LeadSlot.LEAD_1,
    client_1.LeadSlot.LEAD_2,
    client_1.LeadSlot.LEAD_3,
];
const LINK_WITH_PARTIES = {
    linkAsSentinel: true,
    userCompanion: true,
    circle: true,
};
let SentinelService = class SentinelService {
    prisma;
    sms;
    constructor(prisma, sms) {
        this.prisma = prisma;
        this.sms = sms;
    }
    createCircle(userId, dto) {
        return this.prisma.circle.create({
            data: {
                userCompanionId: userId,
                label: dto.label,
                circleType: client_1.CircleType.BASIC,
            },
        });
    }
    async listCircles(userId) {
        await this.ensurePrimaryCircle(userId);
        const circles = await this.prisma.circle.findMany({
            where: { userCompanionId: userId },
            orderBy: { createdAt: 'asc' },
            include: {
                userSentinels: {
                    include: {
                        linkAsSentinel: {
                            select: { id: true, firstName: true, phone: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        return circles.sort((a, b) => a.circleType === client_1.CircleType.FIRST
            ? -1
            : b.circleType === client_1.CircleType.FIRST
                ? 1
                : 0);
    }
    async updateCircle(userId, circleId, dto) {
        await this.ensureCircleOwned(userId, circleId);
        return this.prisma.circle.update({ where: { id: circleId }, data: dto });
    }
    async deleteCircle(userId, circleId) {
        const circle = await this.ensureCircleOwned(userId, circleId);
        if (circle.circleType === client_1.CircleType.FIRST) {
            throw new common_1.ConflictException('The 1st circle cannot be deleted');
        }
        const memberCount = await this.prisma.linkSentinels.count({
            where: { circleId, status: { in: ACTIVE_STATUSES } },
        });
        if (memberCount > 0) {
            throw new common_1.ConflictException('Empty the circle before deleting it');
        }
        await this.prisma.circle.update({
            where: { id: circleId },
            data: { status: client_1.CircleStatus.CLOSED, closedAt: new Date() },
        });
        return { deleted: true };
    }
    async inviteSentinel(userId, circleId, dto) {
        const circle = await this.ensureCircleOwned(userId, circleId);
        const phone = dto.phone.trim();
        const linkedUser = await this.prisma.user.findUnique({ where: { phone } });
        if (linkedUser?.id === userId) {
            throw new common_1.BadRequestException('You cannot add yourself as a Sentinel');
        }
        if (circle.circleType === client_1.CircleType.FIRST && !linkedUser) {
            throw new common_1.BadRequestException('A 1st-circle Sentinel must already have an account');
        }
        const sentinelUser = await this.findOrCreateUserByPhone(phone, dto.name);
        const link = await this.createOrReactivateLink({
            userSentinelId: sentinelUser.id,
            userCompanionId: userId,
            circleId: circle.id,
            circleType: circle.circleType,
            initiatedBy: client_1.LinkInitiator.COMPANION,
            sentinelType: dto.sentinelType ?? client_1.SentinelType.SENTINEL,
            requestedAsLead: dto.requestedAsLead,
        });
        const inviter = await this.getUser(userId);
        await this.sms.send(phone, (0, messages_1.sentinelInvitationSms)(this.label(inviter)));
        return link;
    }
    async requestToBeSentinel(requesterId, dto) {
        const targetPhone = dto.targetPhone.trim();
        const target = await this.prisma.user.findUnique({
            where: { phone: targetPhone },
        });
        if (!target)
            throw new common_1.NotFoundException('No account with this phone number');
        if (target.id === requesterId) {
            throw new common_1.BadRequestException('You cannot request to be your own Sentinel');
        }
        const requester = await this.getUser(requesterId);
        const circle = await this.ensurePrimaryCircle(target.id);
        const link = await this.createOrReactivateLink({
            userSentinelId: requesterId,
            userCompanionId: target.id,
            circleId: circle.id,
            circleType: circle.circleType,
            initiatedBy: client_1.LinkInitiator.SENTINEL,
            sentinelType: client_1.SentinelType.SENTINEL,
            requestedAsLead: false,
        });
        await this.sms.send(targetPhone, (0, messages_1.sentinelRequestSms)(this.label(requester)));
        return link;
    }
    listMyInvitations(userId) {
        return this.prisma.linkSentinels.findMany({
            where: {
                status: client_1.LinkStatus.PENDING,
                initiatedBy: client_1.LinkInitiator.COMPANION,
                userSentinelId: userId,
            },
            include: {
                circle: {
                    select: {
                        id: true,
                        label: true,
                        userCompanion: { select: { id: true, email: true, phone: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    listIncomingRequests(userId) {
        return this.prisma.linkSentinels.findMany({
            where: {
                status: client_1.LinkStatus.PENDING,
                initiatedBy: client_1.LinkInitiator.SENTINEL,
                userCompanionId: userId,
            },
            include: {
                circle: { select: { id: true, label: true } },
                linkAsSentinel: { select: { id: true, firstName: true, phone: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async respondToMembership(userId, linkId, accept) {
        const link = await this.prisma.linkSentinels.findUnique({
            where: { id: linkId },
            include: LINK_WITH_PARTIES,
        });
        if (!link)
            throw new common_1.NotFoundException('Membership not found');
        if (link.status !== client_1.LinkStatus.PENDING) {
            throw new common_1.ConflictException('This invitation has already been answered');
        }
        if (link.initiatedBy === client_1.LinkInitiator.COMPANION) {
            if (link.userSentinelId !== userId) {
                throw new common_1.ForbiddenException('This invitation is not addressed to you');
            }
        }
        else if (link.userCompanionId !== userId) {
            throw new common_1.ForbiddenException('This request is not addressed to you');
        }
        return this.applyResponse(link, accept, false);
    }
    async handleInboundSms(from, body) {
        const intent = (0, messages_1.parseSmsReply)(body);
        if (intent === 'unknown') {
            return { matched: false, reason: 'unrecognized_reply' };
        }
        const phone = from.trim();
        const pending = await this.prisma.linkSentinels.findFirst({
            where: {
                status: client_1.LinkStatus.PENDING,
                OR: [
                    { initiatedBy: client_1.LinkInitiator.COMPANION, linkAsSentinel: { phone } },
                    { initiatedBy: client_1.LinkInitiator.SENTINEL, userCompanion: { phone } },
                ],
            },
            include: LINK_WITH_PARTIES,
            orderBy: { createdAt: 'desc' },
        });
        if (pending) {
            await this.applyResponse(pending, intent === 'accept', true);
            return {
                matched: true,
                action: intent === 'accept' ? 'accepted' : 'declined',
            };
        }
        if (intent === 'decline') {
            const active = await this.prisma.linkSentinels.findFirst({
                where: { status: client_1.LinkStatus.ACCEPTED, linkAsSentinel: { phone } },
                include: LINK_WITH_PARTIES,
                orderBy: { createdAt: 'desc' },
            });
            if (active) {
                await this.leaveLink(active, true);
                return { matched: true, action: 'left' };
            }
        }
        return { matched: false, reason: 'no_actionable_link' };
    }
    async leaveMembershipAsSentinel(userId, linkId) {
        const link = await this.prisma.linkSentinels.findUnique({
            where: { id: linkId },
            include: LINK_WITH_PARTIES,
        });
        if (!link)
            throw new common_1.NotFoundException('Membership not found');
        if (link.userSentinelId !== userId) {
            throw new common_1.ForbiddenException('You are not the Sentinel of this link');
        }
        if (link.status !== client_1.LinkStatus.ACCEPTED) {
            throw new common_1.ConflictException('This link is not active');
        }
        return this.leaveLink(link, false);
    }
    async listCompanions(userId) {
        const links = await this.prisma.linkSentinels.findMany({
            where: {
                status: client_1.LinkStatus.ACCEPTED,
                userSentinelId: userId,
            },
            include: {
                circle: {
                    select: {
                        id: true,
                        label: true,
                        circleType: true,
                        userCompanion: { select: { id: true, email: true, phone: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        return links.map((l) => ({
            linkId: l.id,
            sentinelType: l.sentinelType,
            leadSlot: l.leadSlot,
            circle: {
                id: l.circle.id,
                label: l.circle.label,
                isPrimary: l.circle.circleType === client_1.CircleType.FIRST,
            },
            companion: l.circle.userCompanion,
        }));
    }
    async updateMembership(userId, linkId, dto) {
        const link = await this.getOwnedLink(userId, linkId);
        let circleId = link.circleId;
        let targetIsFirst = link.circle.circleType === client_1.CircleType.FIRST;
        if (dto.circleId && dto.circleId !== link.circleId) {
            const target = await this.ensureCircleOwned(userId, dto.circleId);
            circleId = target.id;
            targetIsFirst = target.circleType === client_1.CircleType.FIRST;
            if (targetIsFirst && link.linkAsSentinel.userType === client_1.UserType.ONLY_SMS) {
                throw new common_1.BadRequestException('A 1st-circle Sentinel must already have an account');
            }
        }
        let leadSlot = link.leadSlot;
        let requestedAsLead = dto.requestedAsLead ?? link.requestedAsLead;
        if (!targetIsFirst) {
            if (dto.requestedAsLead === true) {
                throw new common_1.BadRequestException('Only a 1st-circle Sentinel can be a Lead');
            }
            leadSlot = null;
            requestedAsLead = false;
        }
        else if (dto.requestedAsLead === true && !leadSlot) {
            leadSlot = await this.resolveLeadSlot({ id: circleId, circleType: client_1.CircleType.FIRST }, true);
        }
        else if (dto.requestedAsLead === false) {
            leadSlot = null;
        }
        if (link.leadSlot && !leadSlot) {
            await this.assertLeadPreserved(link);
        }
        return this.prisma.linkSentinels.update({
            where: { id: link.id },
            data: {
                circleId,
                sentinelType: dto.sentinelType ?? link.sentinelType,
                requestedAsLead,
                leadSlot,
            },
        });
    }
    async removeMembership(userId, linkId) {
        const link = await this.getOwnedLink(userId, linkId);
        await this.assertLeadPreserved(link);
        await this.prisma.linkSentinels.update({
            where: { id: link.id },
            data: { status: client_1.LinkStatus.REMOVED },
        });
        return { deleted: true };
    }
    async findOrCreateUserByPhone(phone, name) {
        const existing = await this.prisma.user.findUnique({ where: { phone } });
        if (existing)
            return existing;
        return this.prisma.user.create({
            data: { phone, firstName: name, userType: client_1.UserType.ONLY_SMS },
        });
    }
    async createOrReactivateLink(params) {
        const existing = await this.prisma.linkSentinels.findUnique({
            where: {
                userSentinelId_userCompanionId: {
                    userSentinelId: params.userSentinelId,
                    userCompanionId: params.userCompanionId,
                },
            },
        });
        if (existing && ACTIVE_STATUSES.includes(existing.status)) {
            throw new common_1.ConflictException('A pending or active Sentinel link already exists for this person');
        }
        const leadSlot = await this.resolveLeadSlot({ id: params.circleId, circleType: params.circleType }, params.requestedAsLead);
        const data = {
            circleId: params.circleId,
            status: client_1.LinkStatus.PENDING,
            initiatedBy: params.initiatedBy,
            sentinelType: params.sentinelType,
            requestedAsLead: params.requestedAsLead ?? false,
            leadSlot,
        };
        if (existing) {
            return this.prisma.linkSentinels.update({
                where: { id: existing.id },
                data,
            });
        }
        return this.prisma.linkSentinels.create({
            data: {
                userSentinelId: params.userSentinelId,
                userCompanionId: params.userCompanionId,
                ...data,
            },
        });
    }
    async leaveLink(link, viaSms) {
        await this.assertLeadPreserved(link);
        const updated = await this.prisma.linkSentinels.update({
            where: { id: link.id },
            data: { status: client_1.LinkStatus.REMOVED },
        });
        const sentinelLabel = this.label(link.linkAsSentinel);
        await this.sendSms(link.userCompanion.phone, (0, messages_1.sentinelLeftSms)(sentinelLabel));
        if (viaSms) {
            await this.sendSms(link.linkAsSentinel.phone, (0, messages_1.sentinelLeaveConfirmSms)(this.label(link.userCompanion)));
        }
        return updated;
    }
    async applyResponse(link, accept, viaSms) {
        const updated = await this.prisma.linkSentinels.update({
            where: { id: link.id },
            data: { status: accept ? client_1.LinkStatus.ACCEPTED : client_1.LinkStatus.DECLINED },
        });
        const companionLabel = this.label(link.userCompanion);
        const sentinelLabel = this.label(link.linkAsSentinel);
        if (link.initiatedBy === client_1.LinkInitiator.COMPANION) {
            await this.sendSms(link.userCompanion.phone, (0, messages_1.invitationAnsweredSms)(sentinelLabel, accept));
            if (viaSms) {
                const smsBody = accept
                    ? (0, messages_1.sentinelAcceptedSms)(companionLabel)
                    : (0, messages_1.sentinelDeclinedSms)(companionLabel);
                await this.sendSms(link.linkAsSentinel.phone, smsBody);
            }
        }
        else {
            await this.sendSms(link.linkAsSentinel.phone, (0, messages_1.requestAnsweredSms)(companionLabel, accept));
        }
        return updated;
    }
    async ensureCircleOwned(userId, circleId) {
        const circle = await this.prisma.circle.findUnique({
            where: { id: circleId },
        });
        if (!circle)
            throw new common_1.NotFoundException('Circle not found');
        if (circle.userCompanionId !== userId)
            throw new common_1.ForbiddenException('This circle is not yours');
        return circle;
    }
    async getOwnedLink(userId, linkId) {
        const link = await this.prisma.linkSentinels.findUnique({
            where: { id: linkId },
            include: {
                circle: { select: { userCompanionId: true, circleType: true } },
                linkAsSentinel: { select: { userType: true } },
            },
        });
        if (!link)
            throw new common_1.NotFoundException('Membership not found');
        if (link.circle.userCompanionId !== userId) {
            throw new common_1.ForbiddenException('This Sentinel is not in one of your circles');
        }
        return link;
    }
    async resolveLeadSlot(circle, explicit) {
        if (circle.circleType !== client_1.CircleType.FIRST)
            return null;
        const activeLeads = await this.prisma.linkSentinels.findMany({
            where: {
                circleId: circle.id,
                status: { in: ACTIVE_STATUSES },
                leadSlot: { not: null },
            },
            select: { leadSlot: true },
        });
        const taken = new Set(activeLeads.map((l) => l.leadSlot));
        if (explicit === false)
            return null;
        if (explicit === undefined) {
            return taken.size === 0 ? client_1.LeadSlot.LEAD_1 : null;
        }
        const free = LEAD_SLOTS.find((slot) => !taken.has(slot));
        if (!free) {
            throw new common_1.ConflictException('This 1st circle already has 3 Lead Sentinels');
        }
        return free;
    }
    async assertLeadPreserved(link) {
        if (link.circle.circleType !== client_1.CircleType.FIRST || !link.leadSlot)
            return;
        const [otherActive, otherLeads] = await Promise.all([
            this.prisma.linkSentinels.count({
                where: {
                    circleId: link.circleId,
                    status: client_1.LinkStatus.ACCEPTED,
                    id: { not: link.id },
                },
            }),
            this.prisma.linkSentinels.count({
                where: {
                    circleId: link.circleId,
                    leadSlot: { not: null },
                    status: client_1.LinkStatus.ACCEPTED,
                    id: { not: link.id },
                },
            }),
        ]);
        if (otherActive > 0 && otherLeads === 0) {
            throw new common_1.ConflictException('Designate another Lead Sentinel before removing this one');
        }
    }
    async ensurePrimaryCircle(userCompanionId) {
        const existing = await this.prisma.circle.findFirst({
            where: { userCompanionId, circleType: client_1.CircleType.FIRST },
            orderBy: { createdAt: 'asc' },
        });
        if (existing)
            return existing;
        return this.prisma.circle.create({
            data: {
                userCompanionId,
                label: 'Premier cercle',
                circleType: client_1.CircleType.FIRST,
            },
        });
    }
    async getUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    label(user) {
        return user.firstName ?? user.phone ?? 'Sentinel';
    }
    async sendSms(phone, body) {
        if (!phone)
            return;
        await this.sms.send(phone, body);
    }
};
exports.SentinelService = SentinelService;
exports.SentinelService = SentinelService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(sms_sender_interface_1.SMS_SENDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], SentinelService);
//# sourceMappingURL=sentinel.service.js.map