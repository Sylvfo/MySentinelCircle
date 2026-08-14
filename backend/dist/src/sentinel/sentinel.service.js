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
const MEMBERSHIP_WITH_PARTIES = {
    circle: { include: { owner: true } },
    contact: true,
};
const ACTIVE_STATUSES = [client_1.MembershipStatus.PENDING, client_1.MembershipStatus.ACCEPTED];
let SentinelService = class SentinelService {
    prisma;
    sms;
    constructor(prisma, sms) {
        this.prisma = prisma;
        this.sms = sms;
    }
    createCircle(userId, dto) {
        return this.prisma.circle.create({
            data: { ownerId: userId, label: dto.label, isPrimary: false },
        });
    }
    async listCircles(userId) {
        await this.ensurePrimaryCircle(userId);
        return this.prisma.circle.findMany({
            where: { ownerId: userId },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            include: {
                memberships: {
                    include: { contact: { select: { id: true, name: true, phone: true, userId: true } } },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    }
    async updateCircle(userId, circleId, dto) {
        await this.ensureCircleOwned(userId, circleId);
        return this.prisma.circle.update({ where: { id: circleId }, data: dto });
    }
    async deleteCircle(userId, circleId) {
        const circle = await this.ensureCircleOwned(userId, circleId);
        if (circle.isPrimary) {
            throw new common_1.ConflictException('The 1st circle cannot be deleted');
        }
        const memberCount = await this.prisma.circleMembership.count({ where: { circleId } });
        if (memberCount > 0) {
            throw new common_1.ConflictException('Empty the circle before deleting it');
        }
        await this.prisma.circle.delete({ where: { id: circleId } });
        return { deleted: true };
    }
    async inviteSentinel(userId, circleId, dto) {
        const circle = await this.ensureCircleOwned(userId, circleId);
        const phone = dto.phone.trim();
        const linkedUser = await this.prisma.user.findUnique({ where: { phone } });
        if (linkedUser?.id === userId) {
            throw new common_1.BadRequestException('You cannot add yourself as a Sentinel');
        }
        if (circle.isPrimary && !linkedUser) {
            throw new common_1.BadRequestException('A 1st-circle Sentinel must already have an account');
        }
        const contact = await this.upsertContact(userId, phone, dto.name, linkedUser?.id);
        await this.assertNoActiveMembership(contact.id);
        const membership = await this.prisma.circleMembership.create({
            data: {
                circleId: circle.id,
                contactId: contact.id,
                status: client_1.MembershipStatus.PENDING,
                initiatedBy: client_1.InitiatedBy.ME,
                sentinelType: dto.sentinelType ?? client_1.SentinelType.SENTINEL,
                isReference: await this.resolveIsReference(circle, dto.isReference),
            },
        });
        const inviter = await this.getUser(userId);
        await this.sms.send(phone, (0, messages_1.sentinelInvitationSms)(this.label(inviter)));
        return membership;
    }
    async requestToBeSentinel(requesterId, dto) {
        const targetPhone = dto.targetPhone.trim();
        const target = await this.prisma.user.findUnique({ where: { phone: targetPhone } });
        if (!target)
            throw new common_1.NotFoundException('No account with this phone number');
        if (target.id === requesterId) {
            throw new common_1.BadRequestException('You cannot request to be your own Sentinel');
        }
        const requester = await this.getUser(requesterId);
        const circle = await this.ensurePrimaryCircle(target.id);
        const contact = await this.upsertContact(target.id, requester.phone, requester.firstName, requesterId);
        await this.assertNoActiveMembership(contact.id);
        const membership = await this.prisma.circleMembership.create({
            data: {
                circleId: circle.id,
                contactId: contact.id,
                status: client_1.MembershipStatus.PENDING,
                initiatedBy: client_1.InitiatedBy.SENTINEL,
                sentinelType: client_1.SentinelType.SENTINEL,
                isReference: false,
            },
        });
        await this.sms.send(target.phone, (0, messages_1.sentinelRequestSms)(this.label(requester)));
        return membership;
    }
    listMyInvitations(userId) {
        return this.prisma.circleMembership.findMany({
            where: {
                status: client_1.MembershipStatus.PENDING,
                initiatedBy: client_1.InitiatedBy.ME,
                contact: { userId },
            },
            include: {
                circle: {
                    select: { id: true, label: true, owner: { select: { id: true, email: true, phone: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    listIncomingRequests(userId) {
        return this.prisma.circleMembership.findMany({
            where: {
                status: client_1.MembershipStatus.PENDING,
                initiatedBy: client_1.InitiatedBy.SENTINEL,
                circle: { ownerId: userId },
            },
            include: {
                circle: { select: { id: true, label: true } },
                contact: { select: { id: true, name: true, phone: true, userId: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async respondToMembership(userId, membershipId, accept) {
        const membership = await this.prisma.circleMembership.findUnique({
            where: { id: membershipId },
            include: { circle: { include: { owner: true } }, contact: true },
        });
        if (!membership)
            throw new common_1.NotFoundException('Membership not found');
        if (membership.status !== client_1.MembershipStatus.PENDING) {
            throw new common_1.ConflictException('This invitation has already been answered');
        }
        if (membership.initiatedBy === client_1.InitiatedBy.ME) {
            if (membership.contact.userId !== userId) {
                throw new common_1.ForbiddenException('This invitation is not addressed to you');
            }
        }
        else if (membership.circle.ownerId !== userId) {
            throw new common_1.ForbiddenException('This request is not addressed to you');
        }
        return this.applyResponse(membership, accept, false);
    }
    async handleInboundSms(from, body) {
        const intent = (0, messages_1.parseSmsReply)(body);
        if (intent === 'unknown') {
            return { matched: false, reason: 'unrecognized_reply' };
        }
        const phone = from.trim();
        const pending = await this.prisma.circleMembership.findFirst({
            where: {
                status: client_1.MembershipStatus.PENDING,
                OR: [
                    { initiatedBy: client_1.InitiatedBy.ME, contact: { phone } },
                    { initiatedBy: client_1.InitiatedBy.SENTINEL, circle: { owner: { phone } } },
                ],
            },
            include: MEMBERSHIP_WITH_PARTIES,
            orderBy: { createdAt: 'desc' },
        });
        if (pending) {
            await this.applyResponse(pending, intent === 'accept', true);
            return { matched: true, action: intent === 'accept' ? 'accepted' : 'declined' };
        }
        if (intent === 'decline') {
            const active = await this.prisma.circleMembership.findFirst({
                where: { status: client_1.MembershipStatus.ACCEPTED, contact: { phone } },
                include: MEMBERSHIP_WITH_PARTIES,
                orderBy: { createdAt: 'desc' },
            });
            if (active) {
                await this.leaveMembership(active, true);
                return { matched: true, action: 'left' };
            }
        }
        return { matched: false, reason: 'no_actionable_link' };
    }
    async leaveMembershipAsSentinel(userId, membershipId) {
        const membership = await this.prisma.circleMembership.findUnique({
            where: { id: membershipId },
            include: MEMBERSHIP_WITH_PARTIES,
        });
        if (!membership)
            throw new common_1.NotFoundException('Membership not found');
        if (membership.contact.userId !== userId) {
            throw new common_1.ForbiddenException('You are not the Sentinel of this link');
        }
        if (membership.status !== client_1.MembershipStatus.ACCEPTED) {
            throw new common_1.ConflictException('This link is not active');
        }
        return this.leaveMembership(membership, false);
    }
    async listCompanions(userId) {
        const memberships = await this.prisma.circleMembership.findMany({
            where: {
                status: client_1.MembershipStatus.ACCEPTED,
                contact: { userId },
            },
            include: {
                circle: {
                    select: {
                        id: true,
                        label: true,
                        isPrimary: true,
                        owner: { select: { id: true, email: true, phone: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        return memberships.map((m) => ({
            membershipId: m.id,
            sentinelType: m.sentinelType,
            isReference: m.isReference,
            circle: { id: m.circle.id, label: m.circle.label, isPrimary: m.circle.isPrimary },
            companion: m.circle.owner,
        }));
    }
    async updateMembership(userId, membershipId, dto) {
        const membership = await this.getOwnedMembership(userId, membershipId);
        let circleId = membership.circleId;
        let targetIsPrimary = membership.circle.isPrimary;
        if (dto.circleId && dto.circleId !== membership.circleId) {
            const target = await this.ensureCircleOwned(userId, dto.circleId);
            circleId = target.id;
            targetIsPrimary = target.isPrimary;
            if (target.isPrimary && !membership.contact.userId) {
                throw new common_1.BadRequestException('A 1st-circle Sentinel must already have an account');
            }
        }
        let isReference = dto.isReference ?? membership.isReference;
        if (!targetIsPrimary) {
            if (dto.isReference === true) {
                throw new common_1.BadRequestException('Only a 1st-circle Sentinel can be a reference');
            }
            isReference = false;
        }
        if (membership.isReference && !isReference) {
            await this.assertReferencePreserved(membership);
        }
        return this.prisma.circleMembership.update({
            where: { id: membership.id },
            data: {
                circleId,
                sentinelType: dto.sentinelType ?? membership.sentinelType,
                isReference,
            },
        });
    }
    async removeMembership(userId, membershipId) {
        const membership = await this.getOwnedMembership(userId, membershipId);
        await this.assertReferencePreserved(membership);
        await this.prisma.circleMembership.delete({ where: { id: membership.id } });
        return { deleted: true };
    }
    async leaveMembership(membership, viaSms) {
        await this.assertReferencePreserved(membership);
        const updated = await this.prisma.circleMembership.update({
            where: { id: membership.id },
            data: { status: client_1.MembershipStatus.DECLINED },
        });
        const sentinelLabel = membership.contact.name?.trim() || membership.contact.phone;
        await this.sms.send(membership.circle.owner.phone, (0, messages_1.sentinelLeftSms)(sentinelLabel));
        if (viaSms) {
            await this.sms.send(membership.contact.phone, (0, messages_1.sentinelLeaveConfirmSms)(this.label(membership.circle.owner)));
        }
        return updated;
    }
    async applyResponse(membership, accept, viaSms) {
        const updated = await this.prisma.circleMembership.update({
            where: { id: membership.id },
            data: { status: accept ? client_1.MembershipStatus.ACCEPTED : client_1.MembershipStatus.DECLINED },
        });
        const ownerLabel = this.label(membership.circle.owner);
        const sentinelLabel = membership.contact.name?.trim() || membership.contact.phone;
        if (membership.initiatedBy === client_1.InitiatedBy.ME) {
            await this.sms.send(membership.circle.owner.phone, (0, messages_1.invitationAnsweredSms)(sentinelLabel, accept));
            if (viaSms) {
                const body = accept ? (0, messages_1.sentinelAcceptedSms)(ownerLabel) : (0, messages_1.sentinelDeclinedSms)(ownerLabel);
                await this.sms.send(membership.contact.phone, body);
            }
        }
        else {
            await this.sms.send(membership.contact.phone, (0, messages_1.requestAnsweredSms)(ownerLabel, accept));
        }
        return updated;
    }
    async ensureCircleOwned(userId, circleId) {
        const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
        if (!circle)
            throw new common_1.NotFoundException('Circle not found');
        if (circle.ownerId !== userId)
            throw new common_1.ForbiddenException('This circle is not yours');
        return circle;
    }
    async getOwnedMembership(userId, membershipId) {
        const membership = await this.prisma.circleMembership.findUnique({
            where: { id: membershipId },
            include: {
                circle: { select: { ownerId: true, isPrimary: true } },
                contact: { select: { userId: true } },
            },
        });
        if (!membership)
            throw new common_1.NotFoundException('Membership not found');
        if (membership.circle.ownerId !== userId) {
            throw new common_1.ForbiddenException('This Sentinel is not in one of your circles');
        }
        return membership;
    }
    async resolveIsReference(circle, explicit) {
        if (!circle.isPrimary)
            return false;
        if (explicit !== undefined)
            return explicit;
        const existingRefs = await this.prisma.circleMembership.count({
            where: { circleId: circle.id, isReference: true, status: { in: ACTIVE_STATUSES } },
        });
        return existingRefs === 0;
    }
    async assertReferencePreserved(membership) {
        if (!membership.circle.isPrimary || !membership.isReference)
            return;
        const [otherActive, otherRefs] = await Promise.all([
            this.prisma.circleMembership.count({
                where: { circleId: membership.circleId, status: client_1.MembershipStatus.ACCEPTED, id: { not: membership.id } },
            }),
            this.prisma.circleMembership.count({
                where: { circleId: membership.circleId, isReference: true, status: client_1.MembershipStatus.ACCEPTED, id: { not: membership.id } },
            }),
        ]);
        if (otherActive > 0 && otherRefs === 0) {
            throw new common_1.ConflictException('Designate another reference Sentinel before removing this one');
        }
    }
    async ensurePrimaryCircle(ownerId) {
        const existing = await this.prisma.circle.findFirst({
            where: { ownerId, isPrimary: true },
            orderBy: { createdAt: 'asc' },
        });
        if (existing)
            return existing;
        return this.prisma.circle.create({ data: { ownerId, label: 'Premier cercle', isPrimary: true } });
    }
    async upsertContact(ownerId, phone, name, userId) {
        const existing = await this.prisma.contact.findFirst({ where: { ownerId, phone } });
        if (existing) {
            const data = {};
            if (userId && !existing.userId)
                data.user = { connect: { id: userId } };
            if (Object.keys(data).length === 0)
                return existing;
            return this.prisma.contact.update({ where: { id: existing.id }, data });
        }
        return this.prisma.contact.create({
            data: {
                owner: { connect: { id: ownerId } },
                phone,
                name,
                ...(userId ? { user: { connect: { id: userId } } } : {}),
            },
        });
    }
    async assertNoActiveMembership(contactId) {
        const active = await this.prisma.circleMembership.findFirst({
            where: { contactId, status: { in: ACTIVE_STATUSES } },
        });
        if (active) {
            throw new common_1.ConflictException('A pending or active Sentinel link already exists for this person');
        }
    }
    async getUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    label(user) {
        return user.email ?? user.phone;
    }
};
exports.SentinelService = SentinelService;
exports.SentinelService = SentinelService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(sms_sender_interface_1.SMS_SENDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], SentinelService);
//# sourceMappingURL=sentinel.service.js.map