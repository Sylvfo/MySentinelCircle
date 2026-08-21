import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { SignupPhoneDto } from './dto/signup-phone.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
export declare class AuthController {
    private readonly authService;
    private readonly prisma;
    constructor(authService: AuthService, prisma: PrismaService);
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
    me(user: {
        userId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        firstName: string;
        email: string | null;
        phone: string | null;
        phoneVerifiedAt: Date | null;
    } | null>;
}
