import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiProperty({ required: false, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  // Can only be set once — rejected by the service if the account already
  // has a userName (immutable after that, unlike the other fields here).
  @ApiProperty({ required: false, minLength: 3, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/)
  userName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isMajor?: boolean;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicStatus?: string;
}
