import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AlertType } from '@prisma/client';

// Where the person is, from their phone's GPS (only when they raise an
// alert for themself, and only if they chose to share it).
export class AlertLocationDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  // Radius in meters the phone is confident about.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy?: number;
}

// Raised either by "Me" for themself (companionId === caller) or by an
// accepted 1st-circle Sentinel on "Me"'s behalf.
export class CreateAlertDto {
  @IsString()
  companionId: string;

  @IsEnum(AlertType)
  alertType: AlertType;

  @IsString()
  @MinLength(1)
  reason: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AlertLocationDto)
  location?: AlertLocationDto;
}
