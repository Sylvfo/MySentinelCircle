import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignupEmailDto } from './dto/signup-email.dto';
import { SignupGoogleDto } from './dto/signup-google.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
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
    me(user: {
        userId: string;
    }): Promise<{
        firstName: string;
        email: string | null;
        phone: string;
        id: string;
        phoneVerifiedAt: Date | null;
        createdAt: Date;
    } | null>;
}
