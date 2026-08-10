import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { SentinelType } from '@prisma/client';

// "Me" adjusts an existing membership: change the Sentinel's type, the
// reference/responsible flag, or move them to another of "Me"'s circles.
export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(SentinelType)
  sentinelType?: SentinelType;

  // Reference/responsible flag — only honoured for a tier-1 (1st) circle.
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;

  @IsOptional()
  @IsString()
  circleId?: string;
}
