import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SmsModule } from './sms/sms.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SentinelModule } from './sentinel/sentinel.module';
import { AlertModule } from './alert/alert.module';
import { OrganizationModule } from './organization/organization.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    SmsModule,
    EmailModule,
    AuthModule,
    UserModule,
    SentinelModule,
    AlertModule,
    OrganizationModule,
    MessagingModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
