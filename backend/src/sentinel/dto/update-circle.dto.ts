import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  // During an alert, may this circle's Sentinels chat with the 1st circle?
  // Only applies when the companion's general switch (User.
  // alertChatWithFirstCircle) is on. Rejected on the 1st circle itself.
  @IsOptional()
  @IsBoolean()
  alertChatWithFirstCircle?: boolean;
}
