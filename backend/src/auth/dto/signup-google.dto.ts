import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsPhoneNumber, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  // Visible to other users (invitation target) — mandatory, unlike lastName
  // and phone which can be filled in later.
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

  // Optional at signup — an account without a phone is created as
  // UserType.UNCOMPLETE and can browse, but can't have/be a Sentinel.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
