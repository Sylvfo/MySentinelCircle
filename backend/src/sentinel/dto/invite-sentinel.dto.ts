import { IsBoolean, IsEnum, IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';
import { SentinelType } from '@prisma/client';

// "Me" invites someone (by phone) into one of their circles as a Sentinel.
// Sending an invitation is site-only — there is no SMS path to create one.
export class InviteSentinelDto {
  @IsPhoneNumber()
  phone: string;

  // Prénom is mandatory for everyone (see plan.txt CIRCLES & PERMISSIONS).
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsEnum(SentinelType)
  sentinelType?: SentinelType;

  // Reference/responsible flag — only honoured for a tier-1 (1st) circle.
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;
}
