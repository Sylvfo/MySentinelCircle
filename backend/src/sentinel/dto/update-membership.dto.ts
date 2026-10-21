import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MessagingMode, SentinelType } from '@prisma/client';

// "Me" adjusts an existing membership: change the Sentinel's type, the
// Lead-slot request, the messaging settings, or move them to another of
// "Me"'s circles.
export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(SentinelType)
  sentinelType?: SentinelType;

  // Lead-slot request — only honoured for a tier-1 (1st) circle.
  @IsOptional()
  @IsBoolean()
  requestedAsLead?: boolean;

  @IsOptional()
  @IsString()
  circleId?: string;

  // Messaging settings — only meaningful for account-holding Sentinels
  // (see plan.txt CIRCLES & PERMISSIONS).
  @IsOptional()
  @IsBoolean()
  canMessageOwnCircle?: boolean;

  @IsOptional()
  @IsEnum(MessagingMode)
  firstCircleMessagingMode?: MessagingMode;
}
