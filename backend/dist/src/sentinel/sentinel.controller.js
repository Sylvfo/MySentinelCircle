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
exports.SentinelController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const sentinel_service_1 = require("./sentinel.service");
const create_circle_dto_1 = require("./dto/create-circle.dto");
const update_circle_dto_1 = require("./dto/update-circle.dto");
const invite_sentinel_dto_1 = require("./dto/invite-sentinel.dto");
const request_sentinel_dto_1 = require("./dto/request-sentinel.dto");
const update_membership_dto_1 = require("./dto/update-membership.dto");
let SentinelController = class SentinelController {
    sentinel;
    constructor(sentinel) {
        this.sentinel = sentinel;
    }
    createCircle(user, dto) {
        return this.sentinel.createCircle(user.userId, dto);
    }
    listCircles(user) {
        return this.sentinel.listCircles(user.userId);
    }
    updateCircle(user, id, dto) {
        return this.sentinel.updateCircle(user.userId, id, dto);
    }
    deleteCircle(user, id) {
        return this.sentinel.deleteCircle(user.userId, id);
    }
    invite(user, circleId, dto) {
        return this.sentinel.inviteSentinel(user.userId, circleId, dto);
    }
    request(user, dto) {
        return this.sentinel.requestToBeSentinel(user.userId, dto);
    }
    incomingRequests(user) {
        return this.sentinel.listIncomingRequests(user.userId);
    }
    myInvitations(user) {
        return this.sentinel.listMyInvitations(user.userId);
    }
    accept(user, id) {
        return this.sentinel.respondToMembership(user.userId, id, true);
    }
    decline(user, id) {
        return this.sentinel.respondToMembership(user.userId, id, false);
    }
    leave(user, id) {
        return this.sentinel.leaveMembershipAsSentinel(user.userId, id);
    }
    updateMembership(user, id, dto) {
        return this.sentinel.updateMembership(user.userId, id, dto);
    }
    removeMembership(user, id) {
        return this.sentinel.removeMembership(user.userId, id);
    }
    companions(user) {
        return this.sentinel.listCompanions(user.userId);
    }
};
exports.SentinelController = SentinelController;
__decorate([
    (0, common_1.Post)('circles'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_circle_dto_1.CreateCircleDto]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "createCircle", null);
__decorate([
    (0, common_1.Get)('circles'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "listCircles", null);
__decorate([
    (0, common_1.Patch)('circles/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_circle_dto_1.UpdateCircleDto]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "updateCircle", null);
__decorate([
    (0, common_1.Delete)('circles/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "deleteCircle", null);
__decorate([
    (0, common_1.Post)('circles/:id/invite'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, invite_sentinel_dto_1.InviteSentinelDto]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('requests'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, request_sentinel_dto_1.RequestSentinelDto]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "request", null);
__decorate([
    (0, common_1.Get)('requests'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "incomingRequests", null);
__decorate([
    (0, common_1.Get)('invitations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "myInvitations", null);
__decorate([
    (0, common_1.Post)('memberships/:id/accept'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "accept", null);
__decorate([
    (0, common_1.Post)('memberships/:id/decline'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "decline", null);
__decorate([
    (0, common_1.Post)('memberships/:id/leave'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "leave", null);
__decorate([
    (0, common_1.Patch)('memberships/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_membership_dto_1.UpdateMembershipDto]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "updateMembership", null);
__decorate([
    (0, common_1.Delete)('memberships/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "removeMembership", null);
__decorate([
    (0, common_1.Get)('companions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SentinelController.prototype, "companions", null);
exports.SentinelController = SentinelController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('sentinel'),
    __metadata("design:paramtypes", [sentinel_service_1.SentinelService])
], SentinelController);
//# sourceMappingURL=sentinel.controller.js.map