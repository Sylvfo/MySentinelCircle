"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const google_auth_library_1 = require("google-auth-library");
const bcrypt = __importStar(require("bcryptjs"));
const prisma_service_1 = require("../prisma/prisma.service");
const otp_sender_interface_1 = require("./otp/otp-sender.interface");
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
let AuthService = class AuthService {
    prisma;
    jwt;
    config;
    otpSender;
    googleClient;
    constructor(prisma, jwt, config, otpSender) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.otpSender = otpSender;
        this.googleClient = new google_auth_library_1.OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
    }
    async signupEmail(dto) {
        const [emailTaken, phoneTaken] = await Promise.all([
            this.prisma.user.findUnique({ where: { email: dto.email } }),
            this.prisma.user.findUnique({ where: { phone: dto.phone } }),
        ]);
        if (emailTaken)
            throw new common_1.ConflictException('Email already in use');
        if (phoneTaken)
            throw new common_1.ConflictException('Phone already in use');
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: { firstName: dto.firstName, email: dto.email, passwordHash, phone: dto.phone },
        });
        await this.sendOtp(user.id, user.phone);
        return { userId: user.id };
    }
    async signupGoogle(dto) {
        const { googleId, email } = await this.verifyGoogleIdToken(dto.idToken);
        const [googleTaken, phoneTaken] = await Promise.all([
            this.prisma.user.findUnique({ where: { googleId } }),
            this.prisma.user.findUnique({ where: { phone: dto.phone } }),
        ]);
        if (googleTaken)
            throw new common_1.ConflictException('Google account already linked to a user');
        if (phoneTaken)
            throw new common_1.ConflictException('Phone already in use');
        const user = await this.prisma.user.create({
            data: { firstName: dto.firstName, googleId, email, phone: dto.phone },
        });
        await this.sendOtp(user.id, user.phone);
        return { userId: user.id };
    }
    async loginEmail(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user || !user.passwordHash)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid)
            throw new common_1.UnauthorizedException('Invalid credentials');
        this.assertPhoneVerified(user.phoneVerifiedAt);
        return { accessToken: this.issueToken(user.id) };
    }
    async loginGoogle(dto) {
        const { googleId } = await this.verifyGoogleIdToken(dto.idToken);
        const user = await this.prisma.user.findUnique({ where: { googleId } });
        if (!user)
            throw new common_1.NotFoundException('No account linked to this Google identity');
        this.assertPhoneVerified(user.phoneVerifiedAt);
        return { accessToken: this.issueToken(user.id) };
    }
    async requestOtp(dto) {
        const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
        if (!user)
            throw new common_1.NotFoundException('No account with this phone number');
        await this.sendOtp(user.id, user.phone);
        return { userId: user.id };
    }
    async verifyOtp(dto) {
        const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
        if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
            throw new common_1.UnauthorizedException('No pending OTP for this account');
        }
        if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
            throw new common_1.UnauthorizedException('Too many attempts, request a new code');
        }
        if (user.otpExpiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Code expired, request a new one');
        }
        const valid = await bcrypt.compare(dto.code, user.otpCodeHash);
        if (!valid) {
            await this.prisma.user.update({
                where: { id: user.id },
                data: { otpAttempts: { increment: 1 } },
            });
            throw new common_1.UnauthorizedException('Invalid code');
        }
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                otpCodeHash: null,
                otpExpiresAt: null,
                otpAttempts: 0,
                phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
            },
        });
        return { accessToken: this.issueToken(user.id) };
    }
    async sendOtp(userId, phone) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const otpCodeHash = await bcrypt.hash(code, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                otpCodeHash,
                otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
                otpAttempts: 0,
            },
        });
        await this.otpSender.send(phone, code);
    }
    assertPhoneVerified(phoneVerifiedAt) {
        if (!phoneVerifiedAt) {
            throw new common_1.ForbiddenException('Phone verification is not complete for this account');
        }
    }
    issueToken(userId) {
        return this.jwt.sign({ sub: userId });
    }
    async verifyGoogleIdToken(idToken) {
        const ticket = await this.googleClient.verifyIdToken({
            idToken,
            audience: this.config.get('GOOGLE_CLIENT_ID'),
        });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) {
            throw new common_1.UnauthorizedException('Invalid Google token');
        }
        return { googleId: payload.sub, email: payload.email };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(otp_sender_interface_1.OTP_SENDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map