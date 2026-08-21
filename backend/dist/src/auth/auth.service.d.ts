import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { OtpSender } from './otp/otp-sender.interface';
import type { EmailSender } from '../email/email-sender.interface';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { SignupPhoneDto } from './dto/signup-phone.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly otpSender;
    private readonly emailSender;
    private readonly googleClient;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, otpSender: OtpSender, emailSender: EmailSender);
    signupEmail(dto: SignupEmailDto): Promise<{
        userId: string;
    }>;
    signupGoogle(dto: SignupGoogleDto): Promise<{
        userId: string;
    }>;
    signupPhone(dto: SignupPhoneDto): Promise<{
        userId: string;
    }>;
    loginEmail(dto: LoginEmailDto): Promise<{
        accessToken: string;
    }>;
    loginGoogle(dto: LoginGoogleDto): Promise<{
        accessToken: string;
    }>;
    requestOtp(dto: RequestOtpDto): Promise<{
        userId: string;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        accessToken: string;
    }>;
    requestPasswordReset(dto: RequestPasswordResetDto): Promise<{
        message: string;
    }>;
    confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<{
        message: string;
    }>;
    private claimOrCreateByPhone;
    private sendOtp;
    private assertPhoneVerified;
    private issueToken;
    private verifyGoogleIdToken;
}
