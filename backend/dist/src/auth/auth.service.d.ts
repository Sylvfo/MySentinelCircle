import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { OtpSender } from './otp/otp-sender.interface';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly otpSender;
    private readonly googleClient;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, otpSender: OtpSender);
    signupEmail(dto: SignupEmailDto): Promise<{
        userId: string;
    }>;
    signupGoogle(dto: SignupGoogleDto): Promise<{
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
    private sendOtp;
    private assertPhoneVerified;
    private issueToken;
    private verifyGoogleIdToken;
}
