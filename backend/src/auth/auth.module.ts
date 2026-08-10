import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OTP_SENDER } from './otp/otp-sender.interface';
import { ConsoleOtpSenderService } from './otp/console-otp-sender.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '30d' } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: OTP_SENDER, useClass: ConsoleOtpSenderService },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
