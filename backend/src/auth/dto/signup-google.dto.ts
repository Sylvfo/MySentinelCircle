import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupGoogleDto {
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

  // ID token from Google Sign-In on the client (web or React Native), not
  // an OAuth authorization code — verified server-side, no redirect flow.
  @ApiProperty()
  @IsString()
  idToken: string;
}
