import { Gender } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsEnum,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';

export class SignupEmailDto {
  // Mandatory prénom for every account (see plan.txt CIRCLES & PERMISSIONS).
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ required: false, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  // Visible to other users (invitation target) — mandatory, unlike lastName.
  // No phone here: this path creates a UserType.UNCOMPLETE account, which
  // adds and verifies its phone later (POST /user/phone/request).
  @ApiProperty({ minLength: 3, maxLength: 30 })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/)
  userName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: PASSWORD_MAX_LENGTH })
  @MinLength(8)
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  // Optional: how texts speak about me. Left empty = inclusive wording.
  @ApiProperty({ required: false, enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // The terms of use + privacy policy checkbox (nLPD / GDPR): refused
  // unless explicitly true.
  @ApiProperty({ enum: [true] })
  @Equals(true)
  acceptTerms: boolean;
}
