import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { SentinelType } from '@prisma/client';

// "Me" adjusts an existing membership: change the Sentinel's type, the
// Lead-slot request, or move them to another of "Me"'s circles.
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
}
