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
exports.SentinelSmsController = void 0;
const common_1 = require("@nestjs/common");
const sentinel_service_1 = require("./sentinel.service");
const inbound_sms_dto_1 = require("./dto/inbound-sms.dto");
let SentinelSmsController = class SentinelSmsController {
    sentinel;
    constructor(sentinel) {
        this.sentinel = sentinel;
    }
    inbound(dto) {
        return this.sentinel.handleInboundSms(dto.from, dto.body);
    }
};
exports.SentinelSmsController = SentinelSmsController;
__decorate([
    (0, common_1.Post)('inbound'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [inbound_sms_dto_1.InboundSmsDto]),
    __metadata("design:returntype", void 0)
], SentinelSmsController.prototype, "inbound", null);
exports.SentinelSmsController = SentinelSmsController = __decorate([
    (0, common_1.Controller)('sentinel/sms'),
    __metadata("design:paramtypes", [sentinel_service_1.SentinelService])
], SentinelSmsController);
//# sourceMappingURL=sentinel-sms.controller.js.map