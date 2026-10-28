import { IsEnum, IsString, MinLength } from 'class-validator';
import { AlertType } from '@prisma/client';

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
}
