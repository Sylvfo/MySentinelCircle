import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
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

  // The permanent Me<->Sentinel channel (separate from the two settings
  // above, which only govern alert-time reach) — null = inherit the
  // circle's (then the companion's) setting.
  @IsOptional()
  @IsBoolean()
  canMessageMe?: boolean;

  // Manual outer-circle call rank (lower = called first) for batched alert
  // escalation — see AlertService.requestCircle. Meaningless for the 1st
  // circle (never batched) but harmless to set there.
  @IsOptional()
  @IsInt()
  callOrder?: number;
}
