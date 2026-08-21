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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const signup_email_dto_1 = require("./dto/signup-email.dto");
const signup_google_dto_1 = require("./dto/signup-google.dto");
const login_email_dto_1 = require("./dto/login-email.dto");
const login_google_dto_1 = require("./dto/login-google.dto");
const request_otp_dto_1 = require("./dto/request-otp.dto");
const verify_otp_dto_1 = require("./dto/verify-otp.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const current_user_decorator_1 = require("./decorators/current-user.decorator");
let AuthController = class AuthController {
    authService;
    prisma;
    constructor(authService, prisma) {
        this.authService = authService;
        this.prisma = prisma;
    }
    signupEmail(dto) {
        return this.authService.signupEmail(dto);
    }
    signupGoogle(dto) {
        return this.authService.signupGoogle(dto);
    }
    loginEmail(dto) {
        return this.authService.loginEmail(dto);
    }
    loginGoogle(dto) {
        return this.authService.loginGoogle(dto);
    }
    requestOtp(dto) {
        return this.authService.requestOtp(dto);
    }
    verifyOtp(dto) {
        return this.authService.verifyOtp(dto);
    }
    async me(user) {
        const record = await this.prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                id: true,
                firstName: true,
                email: true,
                phone: true,
                phoneVerifiedAt: true,
                createdAt: true,
            },
        });
        return record;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('signup/email'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [signup_email_dto_1.SignupEmailDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "signupEmail", null);
__decorate([
    (0, common_1.Post)('signup/google'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [signup_google_dto_1.SignupGoogleDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "signupGoogle", null);
__decorate([
    (0, common_1.Post)('login/email'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_email_dto_1.LoginEmailDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "loginEmail", null);
__decorate([
    (0, common_1.Post)('login/google'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_google_dto_1.LoginGoogleDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "loginGoogle", null);
__decorate([
    (0, common_1.Post)('otp/request'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_otp_dto_1.RequestOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestOtp", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_otp_dto_1.VerifyOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        prisma_service_1.PrismaService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map