import { IsString, MaxLength, MinLength } from 'class-validator';

// Creates an "other" circle (work, sport, neighbors...). The single 1st
// circle (isPrimary) is created automatically, not through this endpoint.
export class CreateCircleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}
