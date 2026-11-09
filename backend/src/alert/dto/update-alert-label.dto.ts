import { IsString, MaxLength, MinLength } from 'class-validator';

// Renames an alert — any accepted 1st-circle Sentinel can do this (not the
// companion, unlike updateStatus).
export class UpdateAlertLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;
}
