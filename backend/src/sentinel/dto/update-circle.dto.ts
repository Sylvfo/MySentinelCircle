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

  // null = inherit the companion's allowMessagingByDefault. Rejected on the
  // 1st circle — always reachable, no override possible there.
  @IsOptional()
  @IsBoolean()
  canMessageMe?: boolean;
}
